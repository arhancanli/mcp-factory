"""Comparisons preserve trials and refuse incompatible evaluation protocols."""

import pytest

from canlilabs.lifecycle import compare, model_card
from canlilabs.recipes import train
from canlilabs.records import Ledger


def test_model_card_is_hash_verified_and_comparison_keeps_failure_counts(tmp_path):
    first, second = [train(tmp_path, "ml", seed=seed) for seed in [7, 19]]
    ledger = Ledger(tmp_path)
    with ledger.active_run({"recipe": "ml", "seed": 43}) as (failed, _directory):
        ledger.finish(failed, "failed", {"message": "retained unsuccessful trial"})
    comparison = compare(tmp_path, [first["run_id"], second["run_id"], failed])
    assert comparison["workspace_trial_counts"] == {"succeeded": 2, "failed": 1}
    assert comparison["items"][2]["failure"]["message"] == "retained unsuccessful trial"
    assert "winner" not in comparison and "promotion" not in comparison
    card = model_card(tmp_path, first["run_id"])
    assert card["data"]["split_sha256"] == first["result"]["data"]["split_sha256"]
    assert card["metrics"] == first["result"]["metrics"]
    ledger.artifact(first["run_id"], "model-card.json").write_text("{}")
    with pytest.raises(ValueError, match="hash mismatch"):
        model_card(tmp_path, first["run_id"])


def test_comparison_rejects_different_held_out_protocols_and_duplicate_trials(tmp_path):
    ledger = Ledger(tmp_path)
    run_ids = []
    for split in ["a", "b"]:
        run_id, _directory = ledger.start({"recipe": "ml", "seed": 7})
        ledger.finish(
            run_id,
            "succeeded",
            {
                "data": {"dataset_id": "same-data", "split_sha256": split},
                "metrics": {},
            },
        )
        run_ids.append(run_id)
    with pytest.raises(ValueError, match="same dataset"):
        compare(tmp_path, run_ids)
    with pytest.raises(ValueError, match="distinct"):
        compare(tmp_path, [run_ids[0], run_ids[0]])
