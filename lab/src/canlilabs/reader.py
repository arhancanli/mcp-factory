"""Read-only, bounded laboratory metadata interface for MCP clients."""

import argparse
import hashlib
import json
import re
import sqlite3
import time
from contextlib import contextmanager
from pathlib import Path

from .records import canonical, sha256_file


@contextmanager
def database(workspace):
    location = Path(workspace).resolve() / "experiments.sqlite"
    if not location.exists():
        yield None
        return
    db = sqlite3.connect(location.as_uri() + "?mode=ro", uri=True, timeout=2)
    db.row_factory = sqlite3.Row
    deadline = time.monotonic() + 2
    db.set_progress_handler(lambda: int(time.monotonic() > deadline), 1000)
    try:
        yield db
    finally:
        db.close()


def list_experiments(workspace, limit=20, offset=0, recipe=None):
    if not 1 <= limit <= 100 or offset < 0 or offset > 1_000_000:
        raise ValueError("Use limit 1-100 and offset 0-1000000.")
    if recipe not in [None, "ml", "dl", "rl"]:
        raise ValueError("Recipe must be ml, dl or rl.")
    with database(workspace) as db:
        if db is None:
            return {"total_count": 0, "items": [], "has_more": False, "next_offset": None}
        where = "WHERE json_extract(runs.config, '$.recipe') = ?" if recipe else ""
        parameters = (recipe,) if recipe else ()
        count = db.execute(f"SELECT COUNT(*) FROM runs {where}", parameters).fetchone()[0]
        rows = db.execute(
            f"""
            SELECT runs.run_id, runs.created_at, runs.config, events.state FROM runs
            LEFT JOIN events USING(run_id) {where}
            ORDER BY runs.created_at DESC, runs.run_id LIMIT ? OFFSET ?
        """,
            (*parameters, limit, offset),
        ).fetchall()
    return {
        "total_count": count,
        "items": [
            {
                "run_id": row["run_id"],
                "created_at": row["created_at"],
                "recipe": json.loads(row["config"])["recipe"],
                "state": row["state"] or "started",
            }
            for row in rows
        ],
        "has_more": offset + len(rows) < count,
        "next_offset": offset + len(rows) if offset + len(rows) < count else None,
    }


def get_experiment(workspace, run_id):
    if not re.fullmatch(r"[a-f0-9]{32}", run_id):
        raise ValueError("Use a 32-character run ID returned by lab_list_experiments.")
    with database(workspace) as db:
        row = (
            None
            if db is None
            else db.execute(
                """
            SELECT runs.*, events.state, events.payload FROM runs
            LEFT JOIN events USING(run_id) WHERE run_id = ?
        """,
                (run_id,),
            ).fetchone()
        )
    if row is None:
        raise LookupError("Run not found; list experiments in the configured workspace.")
    return {
        "run_id": row["run_id"],
        "created_at": row["created_at"],
        "state": row["state"] or "started",
        "config": json.loads(row["config"]),
        "provenance": json.loads(row["provenance"]),
        "result": json.loads(row["payload"]) if row["payload"] else None,
    }


def inspect_dataset(workspace, dataset_id, split_sha256=None):
    if not re.fullmatch(r"[a-f0-9]{64}", dataset_id):
        raise ValueError("Use the dataset_id hash from a laboratory experiment.")
    directory = Path(workspace).resolve() / "datasets" / dataset_id
    manifest_path = directory / "manifest.json"
    if not manifest_path.exists():
        raise LookupError("Dataset not found in the configured workspace.")
    if manifest_path.stat().st_size > 64 * 1024:
        raise ValueError("Dataset metadata exceeds the bounded reader limit.")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if not isinstance(manifest, dict):
        raise ValueError("Dataset manifest must be a JSON object.")
    if manifest.get("dataset_id") != dataset_id or manifest.get("sha256") != dataset_id:
        raise ValueError("Dataset manifest does not match the requested content hash.")
    content = directory / "data.csv"
    if content.stat().st_size > 16 * 1024 * 1024:
        raise ValueError("Use a streaming dataset reader above 16 MiB.")
    result = {
        **manifest,
        "manifest_sha256": sha256_file(manifest_path),
        "content_hash_verified": sha256_file(content) == dataset_id,
    }
    if split_sha256 is not None:
        if not re.fullmatch(r"[a-f0-9]{64}", split_sha256):
            raise ValueError("Use the split_sha256 hash from an experiment.")
        split_path = directory / f"splits-{split_sha256}.json"
        if split_path.stat().st_size > 2 * 1024 * 1024:
            raise ValueError("Split evidence exceeds the bounded reader limit.")
        splits = json.loads(split_path.read_text())
        if hashlib.sha256(canonical(splits).encode()).hexdigest() != split_sha256:
            raise ValueError("Split evidence hash mismatch; stored splits were modified.")
        if splits.get("schema") == "canlilabs.tabular-splits.v1":
            if splits["dataset_id"] != dataset_id:
                raise ValueError("Split evidence belongs to a different dataset.")
            if splits.get("manifest_sha256") != result["manifest_sha256"]:
                raise ValueError(
                    "Dataset source/licence metadata differs from the run's split evidence."
                )
            result["manifest_hash_verified"] = True
            result["split"] = {
                key: splits[key]
                for key in [
                    "schema",
                    "dataset_id",
                    "manifest_sha256",
                    "task",
                    "features",
                    "strategy",
                    "seed",
                    "group_column",
                    "time_column",
                    "requested_fractions",
                    "counts",
                    "stratified_components",
                    "profile_sha256",
                    "classes",
                    "checks",
                ]
            }
            if not isinstance(splits.get("profile_sha256"), str) or not re.fullmatch(
                r"[a-f0-9]{64}", splits["profile_sha256"]
            ):
                raise ValueError("Split evidence needs a valid content-addressed profile hash.")
            profile_path = directory / f"profile-{splits['profile_sha256']}.json"
            if profile_path.stat().st_size > 64 * 1024:
                raise ValueError("Data profile exceeds the bounded reader limit.")
            profile = json.loads(profile_path.read_text())
            if hashlib.sha256(canonical(profile).encode()).hexdigest() != splits["profile_sha256"]:
                raise ValueError("Profile evidence hash mismatch; stored metadata was modified.")
            result["profile"] = profile
        elif set(splits) == {"train", "validation", "test"}:
            result["split"] = {"counts": {key: len(value) for key, value in splits.items()}}
        else:
            raise ValueError("Unsupported split evidence schema.")
        result["split_hash_verified"] = True
    return result


def main(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument("--workspace", type=Path, required=True)
    commands = parser.add_subparsers(dest="command", required=True)
    listing = commands.add_parser("list")
    listing.add_argument("--limit", type=int, default=20)
    listing.add_argument("--offset", type=int, default=0)
    listing.add_argument("--recipe", choices=["ml", "dl", "rl"])
    showing = commands.add_parser("get")
    showing.add_argument("run_id")
    dataset = commands.add_parser("dataset")
    dataset.add_argument("dataset_id")
    dataset.add_argument("--split-sha256")
    args = parser.parse_args(argv)
    try:
        if args.command == "list":
            result = list_experiments(args.workspace, args.limit, args.offset, args.recipe)
        elif args.command == "get":
            result = get_experiment(args.workspace, args.run_id)
        else:
            result = inspect_dataset(args.workspace, args.dataset_id, args.split_sha256)
        print(json.dumps(result, sort_keys=True, separators=(",", ":"), allow_nan=False))
        return 0
    except (ValueError, LookupError, OSError, sqlite3.Error) as error:
        code = "not_found" if isinstance(error, LookupError) else "lab_read_failed"
        # Details from private files, filesystem paths or database internals are not exported.
        message = (
            str(error)
            if isinstance(error, (ValueError, LookupError))
            else "Could not read laboratory metadata; verify the configured workspace."
        )
        print(json.dumps({"error": {"code": code, "message": message}}))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
