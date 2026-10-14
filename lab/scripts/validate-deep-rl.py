"""Three fixed CPU DQN trials with independent evaluation and complete accounting."""

import argparse
import json
from datetime import UTC, datetime
from pathlib import Path

import numpy as np

from canlilabs.compute import cpu_environment
from canlilabs.recipes import predict, train
from canlilabs.records import Ledger, sha256_file, source_fingerprint, write_json

SEEDS = [7, 19, 43]
TRAINING_STEPS = 20_000
EVALUATION_EPISODES = 50
# Functional learning criteria, fixed before the first held-out cohort.
CRITERIA = {"minimum_mean_return": 100.0, "minimum_improvement_over_random": 50.0}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workspace", type=Path, required=True)
    parser.add_argument("--receipt", type=Path, required=True)
    args = parser.parse_args()
    workspace = args.workspace.resolve()
    if workspace.exists() and any(workspace.iterdir()):
        raise SystemExit("Use a new empty DQN workspace so every attempt is retained.")
    if args.receipt.exists():
        raise SystemExit("Keep the previous receipt; choose a new output path.")
    profile, source = cpu_environment(), source_fingerprint()
    failures, issues, episodes, learning_curves = [], [], {}, {}
    for seed in SEEDS:
        try:
            run = train(
                workspace,
                "dqn",
                seed=seed,
                training_steps=TRAINING_STEPS,
                evaluation_episodes=EVALUATION_EPISODES,
            )
            print(
                json.dumps(
                    {"seed": seed, "run_id": run["run_id"], "metrics": run["result"]["metrics"]}
                ),
                flush=True,
            )
        except Exception as error:
            failures.append(
                {"seed": seed, "error": type(error).__name__, "message": str(error)[:500]}
            )
    ledger = Ledger(workspace)
    listing = ledger.list(limit=100)
    runs = [ledger.get(item["run_id"]) for item in listing["items"]]
    if listing["total_count"] != len(SEEDS):
        issues.append("All three attempts must be recorded, including failures.")
    for run in runs:
        label = f"DQN seed {run['config']['seed']}"
        if run["state"] != "succeeded":
            issues.append(f"{label}: training failed")
            continue
        result = run["result"]
        if run["provenance"]["code"] != source:
            issues.append(f"{label}: source changed")
        for filename in result["artifacts"]:
            ledger.artifact(run["run_id"], filename)
        raw = json.loads(ledger.artifact(run["run_id"], "evaluation-returns.json").read_text())
        episodes[run["run_id"]] = raw
        curves = json.loads(ledger.artifact(run["run_id"], "learning-curves.json").read_text())
        learning_curves[run["run_id"]] = curves
        accounted_steps = (
            sum(episode["steps"] for episode in curves["training_episodes"])
            + curves["partial_episode"]["steps"]
        )
        if accounted_steps != TRAINING_STEPS:
            issues.append(f"{label}: raw training episodes do not account for all steps")
        protocol = result["environment"]
        if not (
            protocol["training_seed_start"] + protocol["training_reset_count"]
            <= protocol["validation_seed_start"]
            and protocol["validation_seed_start"] + protocol["validation_episodes"]
            <= protocol["evaluation_seed_start"]
        ):
            issues.append(f"{label}: train/validation/test reset seeds overlap")
        policy, baseline = raw["policy"], raw["random"]
        metrics = result["metrics"]
        if policy["reset_seed_start"] != baseline["reset_seed_start"]:
            issues.append(f"{label}: held-out resets must match the baseline")
        if (
            len(policy["returns"]) != EVALUATION_EPISODES
            or len(baseline["returns"]) != EVALUATION_EPISODES
        ):
            issues.append(f"{label}: evaluation episode accounting differs")
        if float(np.mean(policy["returns"])) != metrics["evaluation"]["mean_return"]:
            issues.append(f"{label}: raw policy returns do not match the reported metric")
        if float(np.mean(baseline["returns"])) != metrics["random_policy_baseline"]["mean_return"]:
            issues.append(f"{label}: raw baseline returns do not match the reported metric")
        if metrics["evaluation"]["mean_return"] < CRITERIA["minimum_mean_return"]:
            issues.append(f"{label}: fixed functional learning criterion not met")
        if metrics["return_improvement"] <= CRITERIA["minimum_improvement_over_random"]:
            issues.append(f"{label}: fixed random-baseline improvement criterion not met")
        if result["training"]["steps"] != TRAINING_STEPS or not result["model"]["reload_verified"]:
            issues.append(f"{label}: step budget or reload proof differs")
        if predict(workspace, run["run_id"], [[0.0] * 4])["actions"][0] not in [0, 1]:
            issues.append(f"{label}: real policy inference failed")
    if source_fingerprint() != source:
        issues.append("Source changed during the cohort.")
    receipt = {
        "schema": "canlilabs.deep-rl-validation.v1",
        "checked_at": datetime.now(UTC).isoformat(),
        "validation_script_sha256": sha256_file(__file__),
        "source": source,
        "cpu_profile": profile,
        "fixed_protocol": {
            "training_seeds": SEEDS,
            "training_steps": TRAINING_STEPS,
            "evaluation_episodes": EVALUATION_EPISODES,
            "criteria": CRITERIA,
        },
        "selection_policy": (
            "All seeds and hyperparameters fixed; checkpoints selected only on validation resets."
        ),
        "scope": (
            "CartPole functional CPU DQN learning, per-policy held-out reset uncertainty. "
            "No strongest-algorithm, solved-task, accelerator or production claim."
        ),
        "workspace_total_trials": listing["total_count"],
        "failed_attempts": failures,
        "issues": issues,
        "qualified": not failures and not issues,
        "runs": runs,
        "evaluation_episode_returns": episodes,
        "learning_curves": learning_curves,
    }
    write_json(args.receipt, receipt)
    print(json.dumps({"receipt": str(args.receipt), "qualified": receipt["qualified"]}), flush=True)
    return 0 if receipt["qualified"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
