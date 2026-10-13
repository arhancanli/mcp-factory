"""Bounded local datasets with explicit rights, content hashes and split checks."""

import csv
import hashlib
import io
import json
from pathlib import Path

import numpy as np

from .records import canonical, sha256_file, write_json

MAX_DATASET_BYTES = 16 * 1024 * 1024
MAX_ROWS = 100_000


def check_splits(rows, splits, id_column="id"):
    """Check both identity and content leakage; row IDs alone can miss duplicated data."""
    if set(splits) != {"train", "validation", "test"}:
        raise ValueError("Provide exactly train, validation and test splits.")
    owners = {}
    fingerprints = {}
    identities = {}
    for split, indices in splits.items():
        if not indices:
            raise ValueError(f"The {split} split is empty.")
        for index in indices:
            if not isinstance(index, int) or isinstance(index, bool) or not 0 <= index < len(rows):
                raise ValueError("Split indices must be valid integer row positions.")
            if index in owners:
                raise ValueError("A row position occurs more than once in the split manifest.")
            owners[index] = split
            row = rows[index]
            content = {k: v for k, v in row.items() if k != id_column}
            fingerprint = hashlib.sha256(canonical(content).encode()).hexdigest()
            if fingerprint in fingerprints and fingerprints[fingerprint] != split:
                raise ValueError("Duplicate row content crosses train/evaluation splits.")
            fingerprints[fingerprint] = split
            identity = row.get(id_column)
            if identity is not None:
                if identity in identities:
                    raise ValueError("Row identities must be unique, even inside one split.")
                identities[identity] = split
    if len(owners) != len(rows):
        raise ValueError("The split manifest must account for every dataset row exactly once.")
    return {name: len(indices) for name, indices in splits.items()}


def register_csv(workspace, source_path, *, source, license_id, target="label"):
    if not source.strip() or not license_id.strip():
        raise ValueError("Dataset source and licence are required; do not infer training rights.")
    path = Path(source_path)
    if path.stat().st_size > MAX_DATASET_BYTES:
        raise ValueError(
            "The local CSV path supports at most 16 MiB; use a streaming recipe above it."
        )
    with path.open(newline="", encoding="utf-8") as stream:
        reader = csv.DictReader(stream)
        fields = reader.fieldnames
        if not fields or len(fields) != len(set(fields)) or target not in fields:
            raise ValueError("CSV needs unique column names and the declared target column.")
        if len(fields) > 1024:
            raise ValueError("The local recipe supports at most 1,024 columns.")
        rows = []
        for row in reader:
            if None in row or any(v is None or v.strip() == "" for v in row.values()):
                raise ValueError("Rows must match the schema and have no missing values.")
            rows.append(row)
            if len(rows) > MAX_ROWS:
                raise ValueError("The local CSV recipe supports at most 100,000 rows.")
    if len(rows) < 10:
        raise ValueError("Provide at least ten complete rows for non-empty split evaluation.")
    digest = sha256_file(path)
    directory = Path(workspace) / "datasets" / digest
    directory.mkdir(parents=True, exist_ok=True)
    destination = directory / "data.csv"
    if not destination.exists():
        with destination.open("xb") as stream:
            stream.write(path.read_bytes())
    if sha256_file(destination) != digest:
        raise ValueError("Dataset hash mismatch; immutable stored content has changed.")
    manifest = {
        "schema": "canlilabs.dataset.v1",
        "dataset_id": digest,
        "sha256": digest,
        "source": source,
        "license": license_id,
        "target": target,
        "columns": fields,
        "rows": len(rows),
        "bytes": path.stat().st_size,
        "purpose": "training and independent evaluation",
        "rights_status": "declared_by_registrant",
        "file": "data.csv",
    }
    manifest_path = directory / "manifest.json"
    if manifest_path.exists():
        existing = json.loads(manifest_path.read_text())
        if existing != manifest:
            raise ValueError("The existing dataset has different source/licence/schema metadata.")
    else:
        write_json(manifest_path, manifest)
    return manifest


def prepare_smoke_dataset(workspace):
    """Synthetic smoke fixture, not a claim of a production training corpus."""
    from sklearn.datasets import make_classification
    from sklearn.model_selection import train_test_split

    features, labels = make_classification(
        n_samples=1200,
        n_features=12,
        n_informative=8,
        n_redundant=2,
        class_sep=1.4,
        flip_y=0.015,
        random_state=31415,
    )
    fixture = Path(workspace) / "fixtures" / "classification.csv"
    fixture.parent.mkdir(parents=True, exist_ok=True)
    buffer = io.StringIO(newline="")
    writer = csv.writer(buffer, lineterminator="\n")
    writer.writerow(["id", *[f"x{i}" for i in range(features.shape[1])], "label"])
    for index, (values, label) in enumerate(zip(features, labels, strict=True)):
        writer.writerow([f"row-{index}", *[format(x, ".17g") for x in values], int(label)])
    expected_bytes = buffer.getvalue().encode("utf-8")
    if not fixture.exists():
        with fixture.open("xb") as stream:
            stream.write(expected_bytes)
    if sha256_file(fixture) != hashlib.sha256(expected_bytes).hexdigest():
        raise ValueError("The synthetic fixture was modified; use a new workspace or restore it.")
    manifest = register_csv(
        workspace,
        fixture,
        source="synthetic:sklearn.make_classification:seed=31415",
        license_id="CC0-1.0",
    )
    stored = Path(workspace) / "datasets" / manifest["dataset_id"]
    with (stored / "data.csv").open(newline="", encoding="utf-8") as stream:
        rows = list(csv.DictReader(stream))
    features = np.array([[float(row[f"x{i}"]) for i in range(12)] for row in rows])
    labels = np.array([int(row["label"]) for row in rows])
    if not np.isfinite(features).all() or set(labels) != {0, 1}:
        raise ValueError("Smoke data must contain finite features and both binary labels.")
    indices = np.arange(len(rows))
    train, held_out = train_test_split(indices, test_size=0.4, random_state=2718, stratify=labels)
    validation, test = train_test_split(
        held_out,
        test_size=0.5,
        random_state=2718,
        stratify=labels[held_out],
    )
    splits = {"train": train.tolist(), "validation": validation.tolist(), "test": test.tolist()}
    counts = check_splits(rows, splits)
    split_hash = hashlib.sha256(canonical(splits).encode()).hexdigest()
    split_file = stored / f"splits-{split_hash}.json"
    if split_file.exists():
        if json.loads(split_file.read_text()) != splits:
            raise ValueError("Split manifest was modified.")
    else:
        write_json(split_file, splits)
    return (
        features,
        labels,
        splits,
        {
            "dataset_id": manifest["dataset_id"],
            "split_sha256": split_hash,
            "split_counts": counts,
            "synthetic_smoke_fixture": True,
        },
    )
