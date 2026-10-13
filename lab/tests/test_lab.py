"""Behavioral checks for leakage, immutable evidence and actual learning/reload."""

import json
import sqlite3

import numpy as np
import pytest

from canlilabs import recipes
from canlilabs.cli import main
from canlilabs.data import check_splits, register_csv
from canlilabs.records import Ledger


def test_split_guard_detects_content_leakage_despite_distinct_ids():
    rows = [
        {"id": "a", "x": 1, "label": 0},
        {"id": "b", "x": 2, "label": 1},
        {"id": "c", "x": 1, "label": 0},
    ]
    with pytest.raises(ValueError, match="content crosses"):
        check_splits(rows, {"train": [0], "validation": [1], "test": [2]})


@pytest.mark.parametrize(
    "splits",
    [
        {"train": [0], "validation": [1], "test": [0]},
        {"train": [0], "validation": [1], "test": []},
        {"train": [0], "validation": [1], "test": [3]},
        {"train": [False], "validation": [1], "test": [2]},
    ],
)
def test_split_guard_rejects_overlaps_empty_and_invalid_positions(splits):
    rows = [{"id": str(i), "x": i} for i in range(3)]
    with pytest.raises(ValueError):
        check_splits(rows, splits)


def test_dataset_requires_rights_and_rejects_changed_immutable_content(tmp_path):
    csv = tmp_path / "source.csv"
    csv.write_text("id,x,label\n" + "".join(f"{i},{i},0\n" for i in range(10)))
    with pytest.raises(ValueError, match="licence"):
        register_csv(tmp_path / "data", csv, source="synthetic", license_id="")
    manifest = register_csv(tmp_path / "data", csv, source="synthetic", license_id="CC0-1.0")
    saved = tmp_path / "data/datasets" / manifest["dataset_id"] / "data.csv"
    saved.write_text("modified")
    with pytest.raises(ValueError, match="hash mismatch"):
        register_csv(tmp_path / "data", csv, source="synthetic", license_id="CC0-1.0")


def test_ledger_cannot_replace_success_or_delete_trials(tmp_path):
    ledger = Ledger(tmp_path)
    run_id, _ = ledger.start({"recipe": "ml"})
    ledger.finish(run_id, "failed", {"message": "a recorded failure"})
    with pytest.raises(sqlite3.IntegrityError):
        ledger.finish(run_id, "succeeded", {})
    with ledger.connect() as db, pytest.raises(sqlite3.IntegrityError, match="immutable"):
        db.execute("DELETE FROM runs WHERE run_id = ?", (run_id,))
    assert ledger.get(run_id)["state"] == "failed"
    assert ledger.list()["total_count"] == 1


def test_failed_training_is_preserved_in_all_trial_counts(tmp_path, monkeypatch):
    def failing(*_args):
        raise RuntimeError("deliberate fixture failure")

    monkeypatch.setattr(recipes, "train_ml", failing)
    with pytest.raises(RuntimeError, match="deliberate"):
        recipes.train(tmp_path, "ml")
    listing = Ledger(tmp_path).list()
    assert listing["total_count"] == 1
    assert listing["items"][0]["state"] == "failed"


@pytest.mark.parametrize("recipe", ["ml", "dl"])
def test_classifier_learns_on_held_out_data_and_reproduces_seed(tmp_path, recipe):
    first = recipes.train(tmp_path, recipe, seed=7)
    second = recipes.train(tmp_path, recipe, seed=7)
    result = first["result"]
    assert result["metrics"]["test_accuracy"] >= 0.80
    assert result["metrics"]["test_accuracy"] > result["metrics"]["baseline_test_accuracy"] + 0.15
    assert first["result"]["metrics"] == second["result"]["metrics"]
    assert first["result"]["data"] == second["result"]["data"]
    assert result["model"]["reload_verified"] is True
    assert result["data"]["split_counts"] == {"train": 720, "validation": 240, "test": 240}
    assert first["provenance"]["code"]["files"].get("uv.lock")
    checkpoint = Ledger(tmp_path).artifact(first["run_id"], result["model"]["checkpoint"])
    with checkpoint.open("ab") as stream:
        stream.write(b"modified")
    with pytest.raises(ValueError, match="hash mismatch"):
        recipes.predict(tmp_path, first["run_id"], [[0.0] * 12])


@pytest.mark.parametrize("seed", [7, 19, 43])
def test_rl_learns_and_beats_random_policy_on_independent_evaluation(tmp_path, seed):
    run = recipes.train(tmp_path, "rl", seed=seed)
    result = run["result"]
    assert result["metrics"]["evaluation"]["mean_return"] >= 0.9
    assert result["metrics"]["return_improvement"] > 0.5
    assert result["model"]["reload_verified"] is True
    prediction = recipes.predict(tmp_path, run["run_id"], [0])
    assert prediction["actions"][0] in [1, 2]
    table = np.load(Ledger(tmp_path).artifact(run["run_id"], "q-table.npy"), allow_pickle=False)
    assert table.shape == (16, 4)


def test_cli_outputs_json_and_enforces_bounded_inputs(tmp_path, capsys):
    assert main(["--workspace", str(tmp_path), "runs"]) == 0
    assert json.loads(capsys.readouterr().out)["total_count"] == 0
    assert main(["--workspace", str(tmp_path), "train", "ml", "--epochs", "10000"]) == 1
    assert "epochs" in json.loads(capsys.readouterr().err)["message"]
    assert Ledger(tmp_path).list()["total_count"] == 0
