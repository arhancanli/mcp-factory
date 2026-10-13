"""Verified model documentation and comparisons on the same held-out protocol."""

import json

from .records import Ledger


def make_model_card(run_id, config, result):
    return {
        "schema": "canlilabs.model-card.v1",
        "run_id": run_id,
        "recipe": config["recipe"],
        "task": result["model"].get("task", "reinforcement_learning"),
        "intended_use": "local research and learning on the recorded evaluation protocol",
        "model": result["model"],
        "data": result.get("data"),
        "metrics": result["metrics"],
        "config": config,
        "selection": result["model"].get("selection", "fixed parameters; no test-set tuning"),
        "limitations": [
            "Results apply to the recorded dataset or environment and split/evaluation seeds.",
            "Dataset licences are registrant declarations; inspect source and lineage separately.",
            "Robustness, fairness, calibration and production serving are not qualified here.",
            "Multiple training seeds on one split do not measure population sampling uncertainty.",
        ],
    }


def model_card(workspace, run_id):
    path = Ledger(workspace).artifact(run_id, "model-card.json")
    return json.loads(path.read_text())


def compare(workspace, run_ids):
    if not isinstance(run_ids, list) or not 2 <= len(run_ids) <= 20:
        raise ValueError("Compare 2 to 20 distinct trials.")
    if len(set(run_ids)) != len(run_ids):
        raise ValueError("Comparison trial IDs must be distinct.")
    ledger = Ledger(workspace)
    records = [ledger.get(run_id) for run_id in run_ids]
    successful = [record for record in records if record["state"] == "succeeded"]
    if len(successful) < 2:
        raise ValueError(
            "A comparison needs at least two successful trials; failures stay visible."
        )
    protocols = []
    for record in successful:
        if record["config"]["recipe"] == "rl":
            raise ValueError("RL comparisons need a separate environment/evaluation protocol.")
        data = record["result"]["data"]
        protocols.append(
            (data["dataset_id"], data["split_sha256"], data.get("task", "classification"))
        )
    if len(set(protocols)) != 1:
        raise ValueError("Compare only the same dataset, task and split protocol.")
    with ledger.connect() as database:
        counts = database.execute("""
            SELECT COALESCE(events.state, 'started') AS state, COUNT(*) AS count
            FROM runs LEFT JOIN events USING(run_id) GROUP BY state
        """).fetchall()
    return {
        "schema": "canlilabs.comparison.v1",
        "dataset_id": protocols[0][0],
        "split_sha256": protocols[0][1],
        "task": protocols[0][2],
        "workspace_trial_counts": {row["state"]: row["count"] for row in counts},
        "selected_trials": len(records),
        "items": [
            {
                "run_id": record["run_id"],
                "state": record["state"],
                "recipe": record["config"]["recipe"],
                "seed": record["config"].get("seed"),
                "metrics": record["result"]["metrics"] if record["state"] == "succeeded" else None,
                "failure": record["result"] if record["state"] == "failed" else None,
            }
            for record in records
        ],
        "selection_policy": "No automatic winner or promotion; validation selects candidates.",
        "evaluation_policy": (
            "Hold the final test protocol fixed; new tuning requires fresh evaluation."
        ),
    }
