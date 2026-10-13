"""Run a fixed, untuned ML/DL cohort on attributed UCI multiclass and regression data."""

import argparse
import csv
import hashlib
import io
import json
import urllib.request
import zipfile
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import urlparse

from canlilabs.data import MAX_DATASET_BYTES, register_csv
from canlilabs.lifecycle import compare
from canlilabs.recipes import train
from canlilabs.records import Ledger, sha256_file, write_bytes, write_json

DATASETS = [
    {
        "name": "uci-iris-bezdek",
        "source": "https://archive.ics.uci.edu/dataset/53/iris",
        "download": "https://archive.ics.uci.edu/static/public/53/iris.zip",
        "member": "bezdekIris.data",
        "task": "classification",
        "target": "class",
        "features": ["sepal_length_cm", "sepal_width_cm", "petal_length_cm", "petal_width_cm"],
        "attribution": (
            "Fisher, R. (1936). Iris. UCI Machine Learning Repository. "
            "https://doi.org/10.24432/C56C76. CC BY 4.0; "
            "https://creativecommons.org/licenses/by/4.0/."
        ),
    },
    {
        "name": "uci-wine-quality-white",
        "source": "https://archive.ics.uci.edu/dataset/186/wine+quality",
        "download": "https://archive.ics.uci.edu/static/public/186/wine+quality.zip",
        "member": "winequality-white.csv",
        "task": "regression",
        "target": "quality",
        "features": [
            "fixed_acidity",
            "volatile_acidity",
            "citric_acid",
            "residual_sugar",
            "chlorides",
            "free_sulfur_dioxide",
            "total_sulfur_dioxide",
            "density",
            "pH",
            "sulphates",
            "alcohol",
        ],
        "attribution": (
            "Cortez, P., Cerdeira, A., Almeida, F., Matos, T., & Reis, J. (2009). Wine Quality. "
            "UCI Machine Learning Repository. https://doi.org/10.24432/C56S3T. CC BY 4.0; "
            "https://creativecommons.org/licenses/by/4.0/."
        ),
    },
]


def ingest(workspace, definition):
    with urllib.request.urlopen(definition["download"], timeout=30) as response:
        final = urlparse(response.geturl())
        if final.scheme != "https" or final.hostname != "archive.ics.uci.edu":
            raise ValueError("The public validation source redirected outside its HTTPS host.")
        archive_bytes = response.read(MAX_DATASET_BYTES + 1)
    if len(archive_bytes) > MAX_DATASET_BYTES:
        raise ValueError("Public validation download exceeded the size limit.")
    inputs = workspace / "inputs"
    inputs.mkdir(parents=True, exist_ok=True)
    write_bytes(inputs / f"{definition['name']}.zip", archive_bytes)
    with zipfile.ZipFile(io.BytesIO(archive_bytes)) as archive:
        with archive.open(definition["member"]) as stream:
            original = stream.read(MAX_DATASET_BYTES + 1)
    if len(original) > MAX_DATASET_BYTES:
        raise ValueError("Public archive member exceeded the size limit.")
    parsed = list(
        csv.reader(
            io.StringIO(original.decode()),
            delimiter=("," if definition["task"] == "classification" else ";"),
        )
    )
    transformations = []
    if definition["task"] == "classification":
        rows = [row for row in parsed if row]
        transformations.append(
            "Use the archive's bezdekIris.data member; skip its blank trailing line."
        )
    else:
        expected = [*definition["features"], definition["target"]]
        if [name.replace(" ", "_") for name in parsed[0]] != expected:
            raise ValueError("The UCI Wine Quality column order changed.")
        rows = parsed[1:]
        transformations.append(
            "Parse the semicolon CSV and replace header spaces with underscores."
        )
    if any(len(row) != len(definition["features"]) + 1 for row in rows):
        raise ValueError("The upstream public dataset schema changed.")
    buffer = io.StringIO(newline="")
    writer = csv.writer(buffer, lineterminator="\n")
    writer.writerow(["id", *definition["features"], definition["target"]])
    for index, row in enumerate(rows):
        writer.writerow([f"{definition['name']}:{index}", *row])
    transformations.append("Add deterministic row IDs; serialize comma-separated UTF-8 with LF.")
    csv_path = inputs / f"{definition['name']}.csv"
    write_bytes(csv_path, buffer.getvalue().encode())
    lineage = {
        "schema": "canlilabs.source-lineage.v1",
        "download_url": definition["download"],
        "archive_sha256": hashlib.sha256(archive_bytes).hexdigest(),
        "member": definition["member"],
        "member_sha256": hashlib.sha256(original).hexdigest(),
        "transformations": transformations,
        "converted_sha256": sha256_file(csv_path),
        "licence_reference": definition["source"],
        "licence_id": "CC-BY-4.0",
    }
    manifest = register_csv(
        workspace,
        csv_path,
        source=definition["source"],
        license_id="CC-BY-4.0",
        target=definition["target"],
        lineage=lineage,
        attribution=definition["attribution"],
    )
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workspace", type=Path, required=True)
    parser.add_argument("--receipt", type=Path, required=True)
    args = parser.parse_args()
    workspace = args.workspace.resolve()
    if workspace.exists() and any(workspace.iterdir()):
        raise SystemExit("Use a new empty workspace to retain every trial in this fixed cohort.")
    manifests, runs, comparisons = [], [], []
    for definition in DATASETS:
        manifest = ingest(workspace, definition)
        manifests.append(manifest)
        current = []
        for recipe in ["ml", "dl"]:
            for seed in [7, 19, 43]:
                run = train(
                    workspace,
                    recipe,
                    seed=seed,
                    epochs=30,
                    dataset_id=manifest["dataset_id"],
                    task=definition["task"],
                    features=definition["features"],
                    split_strategy="random",
                    split_seed=2718,
                )
                runs.append(run)
                current.append(run["run_id"])
                print(
                    json.dumps(
                        {
                            "dataset": definition["name"],
                            "recipe": recipe,
                            "seed": seed,
                            "state": run["state"],
                            "metrics": run["result"]["metrics"],
                        }
                    ),
                    flush=True,
                )
        comparisons.append(compare(workspace, current))
    write_json(
        args.receipt,
        {
            "schema": "canlilabs.public-data-validation.v1",
            "checked_at": datetime.now(UTC).isoformat(),
            "validation_script_sha256": sha256_file(__file__),
            "selection_policy": (
                "Parameters, split seed and all three training seeds fixed before testing."
            ),
            "scope": (
                "Two public tabular tasks; no strongest-model, population or production claim."
            ),
            "datasets": manifests,
            "runs": runs,
            "comparisons": comparisons,
            "workspace_total_trials": Ledger(workspace).list()["total_count"],
        },
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
