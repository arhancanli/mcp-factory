"""Run a fixed nine-trial ML/DL/RL CPU cohort, retaining every attempt and failure."""

import argparse
import json
from datetime import UTC, datetime
from pathlib import Path

from canlilabs.compute import cpu_environment
from canlilabs.recipes import train
from canlilabs.records import Ledger, sha256_file, source_fingerprint, write_json


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workspace", type=Path, required=True)
    parser.add_argument("--receipt", type=Path, required=True)
    args = parser.parse_args()
    workspace = args.workspace.resolve()
    if workspace.exists() and any(workspace.iterdir()):
        raise SystemExit("Use a new empty CPU workspace to retain every trial.")
    profile = cpu_environment()
    source = source_fingerprint()
    failures = []
    for recipe in ["ml", "dl", "rl"]:
        for seed in [7, 19, 43]:
            try:
                run = train(workspace, recipe, seed=seed)
                print(
                    json.dumps(
                        {
                            "recipe": recipe,
                            "seed": seed,
                            "state": run["state"],
                            "metrics": run["result"]["metrics"],
                        }
                    ),
                    flush=True,
                )
            except Exception as error:
                failures.append(
                    {
                        "recipe": recipe,
                        "seed": seed,
                        "error": type(error).__name__,
                        "message": str(error)[:500],
                    }
                )
    ledger = Ledger(workspace)
    listing = ledger.list(limit=100)
    runs = [ledger.get(item["run_id"]) for item in listing["items"]]
    issues = ["not all nine attempts were recorded"] if listing["total_count"] != 9 else []
    for run in runs:
        label = f"{run['config']['recipe']} seed {run['config']['seed']}"
        if run["state"] != "succeeded":
            issues.append(f"{label}: training failed")
            continue
        result = run["result"]
        if result["model"].get("reload_verified") is not True:
            issues.append(f"{label}: checkpoint reload unverified")
        for filename in result["artifacts"]:
            try:
                ledger.artifact(run["run_id"], filename)
            except (ValueError, OSError) as error:
                issues.append(f"{label}: artifact verification failed ({type(error).__name__})")
        if run["provenance"]["code"] != source:
            issues.append(f"{label}: source changed during the cohort")
        metrics = result["metrics"]
        if run["config"]["recipe"] in {"ml", "dl"}:
            if (
                metrics["test_accuracy"] < 0.80
                or metrics["test_accuracy"] <= metrics["baseline_test_accuracy"] + 0.15
            ):
                issues.append(f"{label}: classifier did not meet the fixed smoke criterion")
        elif metrics["evaluation"]["mean_return"] < 0.9 or metrics["return_improvement"] <= 0.5:
            issues.append(f"{label}: policy did not meet the fixed smoke criterion")
    if source_fingerprint() != source:
        issues.append("source changed during the cohort")
    receipt = {
        "schema": "canlilabs.cpu-validation.v1",
        "checked_at": datetime.now(UTC).isoformat(),
        "validation_script_sha256": sha256_file(__file__),
        "source": source,
        "cpu_profile": profile,
        "selection_policy": "All three recipes and seeds 7/19/43 fixed before testing.",
        "scope": (
            "Synthetic binary classification and deterministic 4x4 FrozenLake CPU smoke. "
            "No cross-platform bitwise, broader research or production qualification."
        ),
        "workspace_total_trials": listing["total_count"],
        "failed_attempts": failures,
        "issues": issues,
        "qualified": not failures and not issues,
        "runs": runs,
    }
    write_json(args.receipt, receipt)
    print(json.dumps({"receipt": str(args.receipt), "qualified": receipt["qualified"]}))
    return 0 if receipt["qualified"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
