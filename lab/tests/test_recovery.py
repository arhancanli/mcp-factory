"""Durability and worker liveness are tested through failure and process interruption."""

import json
import subprocess
import sys

import pytest

from canlilabs import records
from canlilabs.recipes import train
from canlilabs.records import Ledger, write_json


def test_invalid_json_and_failed_atomic_publish_leave_no_partial_receipt(tmp_path, monkeypatch):
    destination = tmp_path / "record.json"
    with pytest.raises(ValueError):
        write_json(destination, {"bad": float("nan")})
    assert not destination.exists()

    def fail_link(*_args):
        raise OSError("simulated publish failure")

    monkeypatch.setattr(records.os, "link", fail_link)
    with pytest.raises(OSError):
        write_json(destination, {"complete": True})
    assert list(tmp_path.iterdir()) == []


def test_atomic_receipts_never_replace_existing_evidence(tmp_path):
    path = tmp_path / "receipt.json"
    write_json(path, {"first": True})
    with pytest.raises(FileExistsError):
        write_json(path, {"replacement": True})
    assert json.loads(path.read_text()) == {"first": True}


def test_receipt_io_failure_does_not_replace_committed_training_success(tmp_path, monkeypatch):
    original = records.write_json

    def fail_receipt(path, value):
        if path.name in {"started.json", "finished.json"}:
            raise OSError("simulated receipt disk error")
        return original(path, value)

    with monkeypatch.context() as scoped:
        scoped.setattr(records, "write_json", fail_receipt)
        run = train(tmp_path, "ml")
    assert run["state"] == "succeeded"
    ledger = Ledger(tmp_path)
    assert ledger.repair_receipts(run["run_id"])["receipts_verified"]
    assert ledger.get(run["run_id"])["result"] == run["result"]
    with pytest.raises(ValueError, match="unfinished"):
        ledger.recover(run["run_id"], "cannot replace success")


def test_recovery_refuses_a_live_process_then_preserves_killed_trial(tmp_path):
    script = """
import sys
from canlilabs.records import Ledger
with Ledger(sys.argv[1]).active_run({'recipe': 'ml', 'seed': 7}) as (run_id, directory):
    print(run_id, flush=True)
    sys.stdin.read()
"""
    child = subprocess.Popen(
        [sys.executable, "-c", script, str(tmp_path)],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    try:
        run_id = child.stdout.readline().strip()
        assert len(run_id) == 32
        ledger = Ledger(tmp_path)
        with pytest.raises(ValueError, match="active"):
            ledger.recover(run_id, "must not interrupt a live worker")
        assert ledger.get(run_id)["state"] == "started"
        child.kill()
        child.wait(timeout=10)
        result = ledger.recover(run_id, "worker terminated during training")
        assert result["state"] == "failed" and result["result"]["recovered"]
        assert ledger.list()["total_count"] == 1
        assert ledger.repair_receipts(run_id)["receipts_verified"]
    finally:
        if child.poll() is None:
            child.kill()
        child.communicate(timeout=10)


def test_training_interrupt_is_recorded_and_artifact_paths_are_bounded(tmp_path, monkeypatch):
    from canlilabs import recipes

    def interrupted(*_args):
        raise KeyboardInterrupt("operator stopped training")

    monkeypatch.setattr(recipes, "train_ml", interrupted)
    with pytest.raises(KeyboardInterrupt):
        train(tmp_path, "ml")
    ledger = Ledger(tmp_path)
    run_id = ledger.list()["items"][0]["run_id"]
    assert ledger.get(run_id)["result"]["error_type"] == "KeyboardInterrupt"
    with pytest.raises(ValueError, match="path components"):
        ledger.artifact(run_id, "../other/model.npz")


def test_recovery_refuses_legacy_trials_and_missing_lock_files(tmp_path):
    ledger = Ledger(tmp_path)
    legacy, _directory = ledger.start({"recipe": "ml"})
    with pytest.raises(ValueError, match="offline audit"):
        ledger.recover(legacy, "not enough liveness evidence")
    with ledger.active_run({"recipe": "ml"}) as (run_id, directory):
        (directory / ".worker.lock").unlink()
        with pytest.raises(ValueError, match="missing or replaced"):
            ledger.recover(run_id, "must not recreate an active lock file")
        (directory / ".worker.lock").touch()
        with pytest.raises(ValueError, match="was replaced"):
            ledger.recover(run_id, "a new file cannot stand in for the worker's active lock")
    assert ledger.get(legacy)["state"] == ledger.get(run_id)["state"] == "started"
