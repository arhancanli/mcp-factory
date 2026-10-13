"""Recreate a separate metadata-only evaluation ledger from real public receipts."""

import argparse
import gzip
import hashlib
import json
from pathlib import Path

from canlilabs.data import MAX_DATASET_BYTES, register_csv
from canlilabs.records import Ledger, canonical, sha256_file, write_bytes, write_json

root = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--workspace", type=Path, required=True)
args = parser.parse_args()
workspace = args.workspace.resolve()
if workspace.exists() and any(workspace.iterdir()):
    raise SystemExit("Use a new empty evaluation workspace so the frozen cohort stays isolated.")
cohort = json.loads((root / "docs/goal/evidence/2026-10-13-lab-final-runs.json").read_text())
fixtures = root / "lab/evaluation/fixtures"
reference = json.loads((fixtures / "manifest.json").read_text())
archive = fixtures / "classification.csv.gz"
if sha256_file(archive) != reference["compressed_sha256"]:
    raise SystemExit("The frozen archive differs; restore the committed evaluation fixture.")
with gzip.open(archive, "rb") as stream:
    snapshot = stream.read(MAX_DATASET_BYTES + 1)
if (
    len(snapshot) > MAX_DATASET_BYTES
    or hashlib.sha256(snapshot).hexdigest() != reference["dataset_id"]
):
    raise SystemExit("The frozen CSV differs; restore the committed evaluation fixture.")
csv_path = workspace / "fixtures" / "classification.csv"
write_bytes(csv_path, snapshot)
data = register_csv(
    workspace, csv_path, source=reference["source"], license_id=reference["license"]
)
splits = json.loads((fixtures / "classification-splits.json").read_text())
if hashlib.sha256(canonical(splits).encode()).hexdigest() != reference["split_sha256"]:
    raise SystemExit("The frozen split differs; restore the committed evaluation fixture.")
write_json(
    workspace / "datasets" / data["dataset_id"] / f"splits-{reference['split_sha256']}.json",
    splits,
)
for run in cohort["runs"]:
    if run["config"]["recipe"] in ["ml", "dl"]:
        if run["result"]["data"]["dataset_id"] != data["dataset_id"]:
            raise SystemExit("The frozen fixture does not match the recorded cohort.")
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
