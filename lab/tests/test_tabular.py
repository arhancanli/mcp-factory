"""Independent split invariants and real arbitrary-shape model training/inference."""

import csv
import json
from datetime import UTC, datetime, timedelta, timezone

import numpy as np
import pytest
from sklearn.datasets import make_classification, make_regression

from canlilabs.cli import main
from canlilabs.data import register_csv
from canlilabs.recipes import predict, train
from canlilabs.records import Ledger
from canlilabs.tabular import prepare_tabular


def register(tmp_path, rows, columns):
    path = tmp_path / "input.csv"
    with path.open("w", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=columns, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)
    return register_csv(
        tmp_path, path, source="synthetic:test", license_id="CC0-1.0", target="target"
    )["dataset_id"]


def config(dataset_id, **overrides):
    return {
        "dataset_id": dataset_id,
        "task": "classification",
        "features": ["a", "b"],
        "split_strategy": "random",
        "split_seed": 2718,
        "group_column": None,
        "time_column": None,
        **overrides,
    }


def simple_rows(count=90):
    return [
        {"id": str(i), "a": str(i + 10), "b": str(np.sin(i)), "target": str(i % 3)}
        for i in range(count)
    ]


def test_numeric_duplicates_with_different_labels_and_ids_never_cross_splits(tmp_path):
    rows = simple_rows()
    rows.append({**rows[10], "id": "duplicate", "a": "2e1", "target": "2"})
    dataset_id = register(tmp_path, rows, ["id", "a", "b", "target"])
    _features, _labels, splits, evidence = prepare_tabular(tmp_path, config(dataset_id))
    locations = {index: name for name, indices in splits.items() for index in indices}
    assert locations[10] == locations[90]
    assert sorted(locations) == list(range(91))
    assert evidence["duplicate_feature_rows"] == 1
    profile = json.loads(
        (
            tmp_path / "datasets" / dataset_id / f"profile-{evidence['profile_sha256']}.json"
        ).read_text()
    )
    assert profile["conflicting_target_feature_groups"] == 1
    assert prepare_tabular(tmp_path, config(dataset_id))[3] == evidence


def test_subject_groups_and_transitive_duplicate_links_stay_disjoint(tmp_path):
    rows = [{**row, "subject": f"s{i // 2}"} for i, row in enumerate(simple_rows())]
    rows[20].update(a=rows[0]["a"], b=rows[0]["b"])
    dataset_id = register(tmp_path, rows, ["id", "a", "b", "subject", "target"])
    _x, _y, splits, _data = prepare_tabular(
        tmp_path, config(dataset_id, split_strategy="group", group_column="subject")
    )
    subjects = {name: {rows[i]["subject"] for i in indices} for name, indices in splits.items()}
    assert subjects["train"].isdisjoint(subjects["validation"] | subjects["test"])
    assert subjects["validation"].isdisjoint(subjects["test"])
    locations = {i: name for name, indices in splits.items() for i in indices}
    assert locations[0] == locations[1] == locations[20] == locations[21]


def test_time_splits_are_strict_and_keep_tied_timestamps_together(tmp_path):
    rows = [{**row, "time": str(i // 3)} for i, row in enumerate(simple_rows())]
    dataset_id = register(tmp_path, rows, ["id", "a", "b", "time", "target"])
    _x, _y, splits, _data = prepare_tabular(
        tmp_path, config(dataset_id, split_strategy="time", time_column="time")
    )
    times = {name: [float(rows[i]["time"]) for i in indices] for name, indices in splits.items()}
    assert max(times["train"]) < min(times["validation"])
    assert max(times["validation"]) < min(times["test"])
    assert sum(map(len, splits.values())) == len(rows)


def test_time_split_refuses_duplicate_features_at_evaluation_boundary(tmp_path):
    rows = [{**row, "time": str(i)} for i, row in enumerate(simple_rows())]
    rows[80].update(a=rows[0]["a"], b=rows[0]["b"])
    dataset_id = register(tmp_path, rows, ["id", "a", "b", "time", "target"])
    with pytest.raises(ValueError, match="Duplicate numeric features"):
        prepare_tabular(tmp_path, config(dataset_id, split_strategy="time", time_column="time"))


@pytest.mark.parametrize("naive", [False, True])
def test_iso_time_splits_normalize_offsets_and_refuse_undeclared_timezones(tmp_path, naive):
    rows = simple_rows()
    for i, row in enumerate(rows):
        stamp = datetime(2024, 1, 1, tzinfo=UTC) + timedelta(days=i)
        if i % 2:
            stamp = stamp.astimezone(timezone(timedelta(hours=-7)))
        row["time"] = (stamp.replace(tzinfo=None) if naive else stamp).isoformat()
    dataset_id = register(tmp_path, rows, ["id", "a", "b", "time", "target"])
    options = config(dataset_id, split_strategy="time", time_column="time")
    if naive:
        with pytest.raises(ValueError, match="timezone"):
            prepare_tabular(tmp_path, options)
    else:
        _x, _y, splits, _data = prepare_tabular(tmp_path, options)
        times = {
            name: [datetime.fromisoformat(rows[i]["time"]).timestamp() for i in indices]
            for name, indices in splits.items()
        }
        assert max(times["train"]) < min(times["validation"])
        assert max(times["validation"]) < min(times["test"])


def test_chronological_evaluation_cannot_introduce_an_unseen_training_class(tmp_path):
    rows = [{**row, "time": str(i)} for i, row in enumerate(simple_rows())]
    for row in rows[75:]:
        row["target"] = "new-unseen-class"
    dataset_id = register(tmp_path, rows, ["id", "a", "b", "time", "target"])
    with pytest.raises(ValueError, match="every evaluation class"):
        prepare_tabular(tmp_path, config(dataset_id, split_strategy="time", time_column="time"))


@pytest.mark.parametrize("bad_value", ["nan", "inf", "1e999", "not-numeric"])
def test_training_rejects_nonfinite_or_nonnumeric_features(tmp_path, bad_value):
    rows = simple_rows()
    rows[10]["a"] = bad_value
    dataset_id = register(tmp_path, rows, ["id", "a", "b", "target"])
    with pytest.raises(ValueError, match="numeric"):
        train(tmp_path, "ml", **config(dataset_id))
    assert Ledger(tmp_path).list()["items"][0]["state"] == "failed"


def test_exact_target_copy_and_implicit_feature_selection_are_rejected(tmp_path):
    rows = [{**row, "a": row["target"]} for row in simple_rows()]
    dataset_id = register(tmp_path, rows, ["id", "a", "b", "target"])
    with pytest.raises(ValueError, match="target leakage"):
        prepare_tabular(tmp_path, config(dataset_id))
    with pytest.raises(ValueError, match="Declare"):
        train(tmp_path, "ml", dataset_id=dataset_id)
    assert Ledger(tmp_path).list()["total_count"] == 0


@pytest.mark.parametrize("recipe", ["ml", "dl"])
def test_three_class_models_reload_and_return_original_labels(tmp_path, recipe):
    x, labels = make_classification(
        n_samples=240,
        n_features=4,
        n_informative=4,
        n_redundant=0,
        n_classes=3,
        n_clusters_per_class=1,
        class_sep=2,
        random_state=71,
    )
    names = ["red", "green", "blue"]
    rows = [
        {
            "id": str(i),
            **dict(zip(["a", "b", "c", "d"], values, strict=True)),
            "target": names[label],
        }
        for i, (values, label) in enumerate(zip(x, labels, strict=True))
    ]
    dataset_id = register(tmp_path, rows, ["id", "a", "b", "c", "d", "target"])
    options = config(dataset_id, features=["a", "b", "c", "d"])
    run = train(tmp_path, recipe, **options)
    assert run["result"]["metrics"]["test_accuracy"] > 0.8
    assert (
        run["result"]["metrics"]["test_accuracy"]
        > run["result"]["metrics"]["baseline_test_accuracy"]
    )
    assert run["result"]["model"]["features"] == 4
    assert set(run["result"]["model"]["classes"]) == set(names)
    outputs = predict(tmp_path, run["run_id"], x[:3].tolist())["predictions"]
    assert len(outputs) == 3 and set(outputs) <= set(names)
    if recipe == "ml":
        _, _, splits, _ = prepare_tabular(tmp_path, options)
        with np.load(Ledger(tmp_path).artifact(run["run_id"], "model.npz")) as checkpoint:
            np.testing.assert_allclose(checkpoint["mean"], x[splits["train"]].mean(axis=0))


@pytest.mark.parametrize("recipe", ["ml", "dl"])
def test_regressors_beat_train_mean_baseline_and_reload_arbitrary_feature_count(tmp_path, recipe):
    x, targets = make_regression(n_samples=240, n_features=3, noise=0.1, bias=7, random_state=31)
    rows = [
        {"id": str(i), **dict(zip(["a", "b", "c"], values, strict=True)), "target": target}
        for i, (values, target) in enumerate(zip(x, targets, strict=True))
    ]
    dataset_id = register(tmp_path, rows, ["id", "a", "b", "c", "target"])
    run = train(
        tmp_path,
        recipe,
        epochs=60,
        **config(dataset_id, task="regression", features=["a", "b", "c"]),
    )
    metrics = run["result"]["metrics"]
    assert metrics["test_r2"] > 0.85
    assert metrics["test_rmse"] < metrics["baseline_test_rmse"] * 0.4
    outputs = predict(tmp_path, run["run_id"], x[:3].tolist())["predictions"]
    assert len(outputs) == 3 and np.isfinite(outputs).all()
    assert run["result"]["model"]["reload_verified"]


def test_prepare_cli_persists_verifiable_splits_without_creating_trials(tmp_path, capsys):
    dataset_id = register(tmp_path, simple_rows(), ["id", "a", "b", "target"])
    assert (
        main(
            [
                "--workspace",
                str(tmp_path),
                "prepare-data",
                "--dataset-id",
                dataset_id,
                "--features",
                "a",
                "b",
            ]
        )
        == 0
    )
    prepared = json.loads(capsys.readouterr().out)
    assert sum(prepared["split_counts"].values()) == 90
    assert not (tmp_path / "experiments.sqlite").exists()
    split_file = tmp_path / "datasets" / dataset_id / f"splits-{prepared['split_sha256']}.json"
    split_file.write_text("{}")
    with pytest.raises(ValueError, match="modified"):
        prepare_tabular(tmp_path, config(dataset_id))
