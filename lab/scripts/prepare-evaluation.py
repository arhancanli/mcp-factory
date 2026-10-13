"""Recreate a separate metadata-only evaluation ledger from real public receipts."""

import argparse
import json
from pathlib import Path

from canlilabs.data import prepare_smoke_dataset
from canlilabs.records import Ledger, canonical

root = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--workspace", type=Path, required=True)
args = parser.parse_args()
workspace = args.workspace.resolve()
if workspace.exists() and any(workspace.iterdir()):
    raise SystemExit("Use a new empty evaluation workspace so the frozen cohort stays isolated.")
cohort = json.loads((root / "docs/goal/evidence/2026-10-13-lab-final-runs.json").read_text())
_, _, _, data = prepare_smoke_dataset(workspace)
for run in cohort["runs"]:
    if run["config"]["recipe"] in ["ml", "dl"]:
        if run["result"]["data"]["dataset_id"] != data["dataset_id"]:
            raise SystemExit("The recreated fixture differs; use the receipt's locked environment.")
ledger = Ledger(workspace)
with ledger.connect() as database:
    for run in cohort["runs"]:
        database.execute(
            "INSERT INTO runs VALUES (?, ?, ?, ?)",
            (
                run["run_id"],
                run["created_at"],
                canonical(run["config"]),
                canonical(run["provenance"]),
            ),
        )
        database.execute(
            "INSERT INTO events(run_id, state, created_at, payload) VALUES (?, ?, ?, ?)",
            (run["run_id"], run["state"], run["created_at"], canonical(run["result"])),
        )
print(
    json.dumps(
        {
            "workspace": str(workspace),
            "cohort_runs": ledger.list()["total_count"],
            "scope": "metadata replica of nine recorded real runs; weights not copied",
        }
    )
)
