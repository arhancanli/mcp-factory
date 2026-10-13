"""Trainable numeric tables with explicit feature selection and leakage-safe splits."""

import csv
import hashlib
import io
import json
import re
from datetime import UTC, datetime
from pathlib import Path

import numpy as np

from .data import MAX_DATASET_BYTES, MAX_ROWS, check_splits
from .records import canonical, write_json

MAX_TRAINING_ROWS = 20_000
MAX_FEATURES = 128
MAX_CLASSES = 64


def load_registered(workspace, dataset_id):
    if not isinstance(dataset_id, str) or not re.fullmatch(r"[a-f0-9]{64}", dataset_id):
        raise ValueError("Dataset ID must be the SHA-256 returned by register-data.")
    directory = Path(workspace) / "datasets" / dataset_id
    manifest_path = directory / "manifest.json"
    if manifest_path.stat().st_size > 64 * 1024:
        raise ValueError("Dataset metadata exceeds 64 KiB.")
    manifest_bytes = manifest_path.read_bytes()
    manifest = json.loads(manifest_bytes)
    manifest_hash = hashlib.sha256(manifest_bytes).hexdigest()
    if not isinstance(manifest, dict) or manifest.get("schema") != "canlilabs.dataset.v1":
        raise ValueError("Use a registered CanliLabs dataset manifest.")
    content = directory / "data.csv"
    with content.open("rb") as stream:
        snapshot = stream.read(MAX_DATASET_BYTES + 1)
    if len(snapshot) > MAX_DATASET_BYTES:
        raise ValueError("Use a streaming recipe above 16 MiB.")
    digest = hashlib.sha256(snapshot).hexdigest()
    if digest != dataset_id or manifest.get("sha256") != dataset_id:
        raise ValueError("Dataset hash mismatch; registered content was modified.")
    if manifest.get("dataset_id") != dataset_id or manifest.get("file") != "data.csv":
        raise ValueError("Dataset manifest does not describe this content-addressed table.")
    reader = csv.DictReader(io.StringIO(snapshot.decode("utf-8"), newline=""))
    if (
        not reader.fieldnames
        or reader.fieldnames != manifest.get("columns")
        or len(set(reader.fieldnames)) != len(reader.fieldnames)
    ):
        raise ValueError("Dataset columns differ from the registered schema.")
    if manifest.get("target") not in reader.fieldnames:
        raise ValueError("The registered target must be a dataset column.")
    rows = []
    for row in reader:
        if None in row or any(value is None or not value.strip() for value in row.values()):
            raise ValueError("Dataset rows must match the schema without missing values.")
        rows.append(row)
        if len(rows) > MAX_ROWS:
            raise ValueError("Dataset exceeds the registered row limit.")
    if len(rows) != manifest.get("rows") or len(snapshot) != manifest.get("bytes"):
        raise ValueError("Dataset size differs from its manifest.")
    if not manifest.get("source") or not manifest.get("license"):
        raise ValueError("Registered data needs explicit source and licence metadata.")
    if manifest.get("rights_status") != "declared_by_registrant":
        raise ValueError("The manifest must record how dataset rights were declared.")
    return directory, manifest, rows, manifest_hash


def validate_options(config):
    if not isinstance(config["dataset_id"], str) or not re.fullmatch(
        r"[a-f0-9]{64}", config["dataset_id"]
    ):
        raise ValueError("Dataset ID must be the SHA-256 returned by register-data.")
    if config["task"] not in {"classification", "regression"}:
        raise ValueError("Task must be classification or regression.")
    if config["split_strategy"] not in {"random", "group", "time"}:
        raise ValueError("Split strategy must be random, group or time.")
    if type(config["split_seed"]) is not int or not 0 <= config["split_seed"] < 2**31:
        raise ValueError("Split seed must be an integer from 0 to 2^31-1.")
    features = config["features"]
    if not isinstance(features, list) or not 1 <= len(features) <= MAX_FEATURES:
        raise ValueError("Declare 1 to 128 numeric feature columns with --features.")
    if any(not isinstance(name, str) or not name or len(name) > 128 for name in features):
        raise ValueError("Feature names must be non-empty strings of at most 128 characters.")
    if len(features) != len(set(features)):
        raise ValueError("Feature columns must be unique and ordered.")
    strategy, group, time = (config[k] for k in ["split_strategy", "group_column", "time_column"])
    if any(
        value is not None and (not isinstance(value, str) or not 1 <= len(value) <= 128)
        for value in [group, time]
    ):
        raise ValueError("Group/time column names must be strings of 1 to 128 characters.")
    if strategy == "group" and not group:
        raise ValueError("A group split requires --group-column.")
    if strategy == "time" and not time:
        raise ValueError("A time split requires --time-column.")
    if (time and strategy != "time") or (group and strategy == "random"):
        raise ValueError("Use the group/time split strategy for declared group/time columns.")


def _table(manifest, rows, config):
    validate_options(config)
    if not 10 <= len(rows) <= MAX_TRAINING_ROWS:
        raise ValueError("Local tabular training supports 10 to 20,000 rows.")
    target = manifest["target"]
    columns = manifest["columns"]
    excluded = {target, "id", config["group_column"], config["time_column"]}
    if any(name not in columns or name in excluded for name in config["features"]):
        raise ValueError("Features must exist and exclude target, id, group and time columns.")
    for column in [config["group_column"], config["time_column"]]:
        if column and (column not in columns or column == target or column == "id"):
            raise ValueError("Group/time columns must exist and differ from target and row id.")
    identities = [row["id"] for row in rows] if "id" in columns else []
    if len(identities) != len(set(identities)):
        raise ValueError("Row identities must be unique.")
    try:
        features = np.asarray([[float(row[name]) for name in config["features"]] for row in rows])
    except ValueError as error:
        raise ValueError("Declared features must contain only numeric values.") from error
    if not np.isfinite(features).all():
        raise ValueError("Declared features must contain only finite numeric values.")
    raw_targets = [row[target] for row in rows]
    if any(len(label) > 128 for label in raw_targets):
        raise ValueError("Targets must fit within 128 characters.")
    try:
        numeric_targets = np.asarray([float(value) for value in raw_targets])
    except ValueError:
        numeric_targets = None
    if numeric_targets is not None and not np.isfinite(numeric_targets).all():
        raise ValueError("Numeric targets must be finite.")
    if numeric_targets is not None and any(
        np.array_equal(features[:, index], numeric_targets) for index in range(features.shape[1])
    ):
        raise ValueError("A feature copies the target exactly; remove this target leakage.")
    if config["task"] == "regression":
        if numeric_targets is None or np.unique(numeric_targets).size < 2:
            raise ValueError("Regression needs a finite numeric, non-constant target.")
        targets = numeric_targets
    else:
        targets = np.asarray(raw_targets)
        if not 2 <= len(set(raw_targets)) <= MAX_CLASSES:
            raise ValueError("Classification needs 2 to 64 distinct target labels.")
    # Canonical numeric values catch 1, 1.0 and 1e0, and ignore IDs and targets.
    fingerprints = [
        hashlib.sha256(canonical([float(v) if v != 0 else 0.0 for v in row]).encode()).hexdigest()
        for row in features
    ]
    return features, targets, fingerprints


def _components(rows, fingerprints, group_column):
    """Union duplicate features and declared subjects, including transitive overlap."""
    parents = list(range(len(rows)))

    def find(index):
        while parents[index] != index:
            parents[index] = parents[parents[index]]
            index = parents[index]
        return index

    def union(left, right):
        parents[find(right)] = find(left)

    by_feature, by_group = {}, {}
    for index, fingerprint in enumerate(fingerprints):
        if fingerprint in by_feature:
            union(index, by_feature[fingerprint])
        else:
            by_feature[fingerprint] = index
        if group_column:
            group = rows[index][group_column]
            if group in by_group:
                union(index, by_group[group])
            else:
                by_group[group] = index
    members = {}
    for index in range(len(rows)):
        members.setdefault(find(index), []).append(index)
    return list(members.values())


def _timestamps(rows, column):
    values = [row[column] for row in rows]
    try:
        timestamps = np.asarray([float(value) for value in values])
    except ValueError:
        parsed = []
        for value in values:
            try:
                stamp = datetime.fromisoformat(value.replace("Z", "+00:00"))
            except ValueError as error:
                raise ValueError("Time values must be numeric or ISO 8601 timestamps.") from error
            if stamp.tzinfo is None:
                raise ValueError("ISO time values must declare their timezone.") from None
            parsed.append(stamp.astimezone(UTC).timestamp())
        timestamps = np.asarray(parsed)
    if not np.isfinite(timestamps).all():
        raise ValueError("Time values must be finite.")
    return timestamps


def _splits(rows, targets, fingerprints, config):
    strategy = config["split_strategy"]
    if strategy == "time":
        timestamps = _timestamps(rows, config["time_column"])
        order = np.argsort(timestamps, kind="stable")
        sorted_times = timestamps[order]
        boundaries = np.flatnonzero(sorted_times[1:] != sorted_times[:-1]) + 1
        if len(boundaries) < 2:
            raise ValueError("A time split needs at least three distinct timestamps.")
        # Reserve a later boundary for validation/test, even when large time ties dominate.
        candidates = boundaries[:-1]
        first = int(candidates[np.abs(candidates - 0.6 * len(rows)).argmin()])
        later = boundaries[boundaries > first]
        if not len(later):
            raise ValueError("Timestamp ties leave no independent test split.")
        second = int(later[np.abs(later - 0.8 * len(rows)).argmin()])
        partitions = [order[:first].tolist(), order[first:second].tolist(), order[second:].tolist()]
        stratified = False
    else:
        from sklearn.model_selection import train_test_split

        components = _components(rows, fingerprints, config["group_column"])
        if len(components) < 10:
            raise ValueError("Provide at least ten independent feature/group components.")
        unit_labels = None
        stratified = config["task"] == "classification" and strategy == "random"
        if stratified:
            # Conflicting labels stay together; the most frequent label stratifies the unit.
            unit_labels = []
            for indices in components:
                labels, counts = np.unique(targets[indices], return_counts=True)
                unit_labels.append(labels[counts.argmax()])
            unit_labels = np.asarray(unit_labels)
        units = np.arange(len(components))
        try:
            train, held_out = train_test_split(
                units, test_size=0.4, random_state=config["split_seed"], stratify=unit_labels
            )
            validation, test = train_test_split(
                held_out,
                test_size=0.5,
                random_state=config["split_seed"],
                stratify=unit_labels[held_out] if stratified else None,
            )
        except ValueError as error:
            raise ValueError("Too few independent examples per class for three splits.") from error
        partitions = [
            [index for unit in partition for index in components[unit]]
            for partition in [train, validation, test]
        ]
    splits = dict(zip(["train", "validation", "test"], partitions, strict=True))
    counts = check_splits(rows, splits)
    owners, group_owners = {}, {}
    for name, indices in splits.items():
        for index in indices:
            fingerprint = fingerprints[index]
            if owners.get(fingerprint, name) != name:
                raise ValueError("Duplicate numeric features cross time splits; resolve the data.")
            owners[fingerprint] = name
            if config["group_column"]:
                group = rows[index][config["group_column"]]
                if group_owners.get(group, name) != name:
                    raise ValueError("A declared group crosses time splits; resolve the data.")
                group_owners[group] = name
    return splits, counts, stratified


def _save_immutable(path, document):
    if path.exists():
        if json.loads(path.read_text()) != document:
            raise ValueError("Stored data evidence was modified.")
    else:
        try:
            write_json(path, document)
        except FileExistsError:
            if json.loads(path.read_text()) != document:
                raise ValueError("Concurrent data evidence differs.") from None


def prepare_tabular(workspace, config):
    directory, manifest, rows, manifest_hash = load_registered(workspace, config["dataset_id"])
    features, targets, fingerprints = _table(manifest, rows, config)
    splits, counts, stratified = _splits(rows, targets, fingerprints, config)
    classes = None
    if config["task"] == "classification":
        classes = sorted(set(targets[splits["train"]].tolist()))
        if len(classes) < 2 or set(targets.tolist()) != set(classes):
            raise ValueError(
                "Training must contain every evaluation class and at least two classes."
            )
        mapping = {label: index for index, label in enumerate(classes)}
        targets = np.asarray([mapping[label] for label in targets])
    elif np.std(targets[splits["train"]]) == 0:
        raise ValueError("The training target is constant; choose a meaningful split.")
    train = features[splits["train"]]
    unique_fingerprints = set(fingerprints)
    labels_by_fingerprint = {}
    for fingerprint, target in zip(fingerprints, targets, strict=True):
        # Regression aliases such as 1 and 1.0 are the same numeric target.
        labels_by_fingerprint.setdefault(fingerprint, set()).add(target)
    profile = {
        "schema": "canlilabs.tabular-profile.v1",
        "dataset_id": manifest["dataset_id"],
        "task": config["task"],
        "rows": len(rows),
        "numeric_features": config["features"],
        "duplicate_feature_rows": len(rows) - len(unique_fingerprints),
        "conflicting_target_feature_groups": sum(
            len(v) > 1 for v in labels_by_fingerprint.values()
        ),
        "missing_values": 0,
        "nonfinite_values": 0,
        "training_feature_statistics": {
            name: {"mean": float(train[:, i].mean()), "std": float(train[:, i].std())}
            for i, name in enumerate(config["features"])
        },
    }
    profile_hash = hashlib.sha256(canonical(profile).encode()).hexdigest()
    _save_immutable(directory / f"profile-{profile_hash}.json", profile)
    split_document = {
        "schema": "canlilabs.tabular-splits.v1",
        "dataset_id": manifest["dataset_id"],
        "manifest_sha256": manifest_hash,
        "task": config["task"],
        "features": config["features"],
        "strategy": config["split_strategy"],
        "seed": config["split_seed"] if config["split_strategy"] != "time" else None,
        "group_column": config["group_column"],
        "time_column": config["time_column"],
        "requested_fractions": {"train": 0.6, "validation": 0.2, "test": 0.2},
        "counts": counts,
        "stratified_components": stratified,
        "profile_sha256": profile_hash,
        "classes": classes,
        "splits": splits,
        "checks": {
            "every_row_once": True,
            "feature_duplicates_disjoint": True,
            "groups_disjoint": True if config["group_column"] else None,
            "strict_time_order": True if config["split_strategy"] == "time" else None,
            "exact_numeric_target_copy_absent": True,
        },
    }
    split_hash = hashlib.sha256(canonical(split_document).encode()).hexdigest()
    _save_immutable(directory / f"splits-{split_hash}.json", split_document)
    return (
        features,
        targets,
        splits,
        {
            "dataset_id": manifest["dataset_id"],
            "manifest_sha256": manifest_hash,
            "source": manifest["source"],
            "license": manifest["license"],
            "rights_status": manifest["rights_status"],
            "split_sha256": split_hash,
            "split_counts": counts,
            "split_strategy": config["split_strategy"],
            "profile_sha256": profile_hash,
            "task": config["task"],
            "feature_names": config["features"],
            "classes": classes,
            "duplicate_feature_rows": profile["duplicate_feature_rows"],
            "synthetic_smoke_fixture": False,
        },
    )
