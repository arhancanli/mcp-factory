"""Read-only, bounded laboratory metadata interface for MCP clients."""

import argparse
import json
import re
import sqlite3
import time
from contextlib import contextmanager
from pathlib import Path

from .records import sha256_file


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


def inspect_dataset(workspace, dataset_id):
    if not re.fullmatch(r"[a-f0-9]{64}", dataset_id):
        raise ValueError("Use the dataset_id hash from a laboratory experiment.")
    directory = Path(workspace).resolve() / "datasets" / dataset_id
    manifest_path = directory / "manifest.json"
    if not manifest_path.exists():
        raise LookupError("Dataset not found in the configured workspace.")
    if manifest_path.stat().st_size > 64 * 1024:
        raise ValueError("Dataset metadata exceeds the bounded reader limit.")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    content = directory / "data.csv"
    if content.stat().st_size > 16 * 1024 * 1024:
        raise ValueError("Use a streaming dataset reader above 16 MiB.")
    return {**manifest, "content_hash_verified": sha256_file(content) == manifest["sha256"]}


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
    args = parser.parse_args(argv)
    try:
        if args.command == "list":
            result = list_experiments(args.workspace, args.limit, args.offset, args.recipe)
        elif args.command == "get":
            result = get_experiment(args.workspace, args.run_id)
        else:
            result = inspect_dataset(args.workspace, args.dataset_id)
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
