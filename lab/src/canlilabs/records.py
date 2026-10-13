"""Content-addressed artifacts and an append-only experiment event ledger."""

import hashlib
import importlib.metadata
import json
import platform
import sqlite3
import sys
import uuid
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False)


def sha256_file(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def write_json(path, value):
    """Exclusive creation prevents a run or manifest from being silently rewritten."""
    destination = Path(path)
    destination.parent.mkdir(parents=True, exist_ok=True)
    with destination.open("x", encoding="utf-8") as stream:
        stream.write(json.dumps(value, indent=2, sort_keys=True, allow_nan=False) + "\n")


def source_fingerprint():
    source_dir = Path(__file__).parent
    files = {path.name: sha256_file(path) for path in sorted(source_dir.glob("*.py"))}
    lab_root = source_dir.parents[1]
    for name in ["pyproject.toml", "uv.lock"]:
        path = lab_root / name
        if path.exists():
            files[name] = sha256_file(path)
    return {
        "sha256": hashlib.sha256(canonical(files).encode()).hexdigest(),
        "files": files,
    }


def environment():
    return {
        "python": sys.version.split()[0],
        "platform": platform.system(),
        "machine": platform.machine(),
        "dependencies": {
            name: importlib.metadata.version(name)
            for name in ["canlilabs", "numpy", "scikit-learn", "torch", "gymnasium"]
        },
    }


class Ledger:
    """All trials remain visible, including failures. Final events cannot be replaced."""

    def __init__(self, workspace):
        self.workspace = Path(workspace).resolve()
        self.workspace.mkdir(parents=True, exist_ok=True)
        self.database = self.workspace / "experiments.sqlite"
        with self.connect() as db:
            db.executescript("""
                CREATE TABLE IF NOT EXISTS runs (
                    run_id TEXT PRIMARY KEY, created_at TEXT NOT NULL,
                    config TEXT NOT NULL, provenance TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS events (
                    sequence INTEGER PRIMARY KEY AUTOINCREMENT,
                    run_id TEXT NOT NULL REFERENCES runs(run_id),
                    state TEXT NOT NULL CHECK(state IN ('succeeded', 'failed')),
                    created_at TEXT NOT NULL, payload TEXT NOT NULL,
                    UNIQUE(run_id)
                );
                CREATE TRIGGER IF NOT EXISTS runs_no_update
                    BEFORE UPDATE ON runs BEGIN SELECT RAISE(ABORT, 'immutable run'); END;
                CREATE TRIGGER IF NOT EXISTS runs_no_delete
                    BEFORE DELETE ON runs BEGIN SELECT RAISE(ABORT, 'immutable run'); END;
                CREATE TRIGGER IF NOT EXISTS events_no_update
                    BEFORE UPDATE ON events BEGIN SELECT RAISE(ABORT, 'immutable event'); END;
                CREATE TRIGGER IF NOT EXISTS events_no_delete
                    BEFORE DELETE ON events BEGIN SELECT RAISE(ABORT, 'immutable event'); END;
            """)

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.database, timeout=10)
        db.execute("PRAGMA foreign_keys = ON")
        db.row_factory = sqlite3.Row
        try:
            with db:
                yield db
        finally:
            db.close()

    def start(self, config):
        run_id = uuid.uuid4().hex
        directory = self.workspace / "runs" / run_id
        directory.mkdir(parents=True, exist_ok=False)
        provenance = {"code": source_fingerprint(), "environment": environment()}
        created_at = datetime.now(UTC).isoformat()
        with self.connect() as db:
            db.execute(
                "INSERT INTO runs VALUES (?, ?, ?, ?)",
                (run_id, created_at, canonical(config), canonical(provenance)),
            )
        write_json(
            directory / "started.json",
            {
                "run_id": run_id,
                "created_at": created_at,
                "config": config,
                "provenance": provenance,
            },
        )
        return run_id, directory

    def finish(self, run_id, state, payload):
        created_at = datetime.now(UTC).isoformat()
        with self.connect() as db:
            db.execute(
                "INSERT INTO events(run_id, state, created_at, payload) VALUES (?, ?, ?, ?)",
                (run_id, state, created_at, canonical(payload)),
            )
            write_json(
                self.workspace / "runs" / run_id / "finished.json",
                {
                    "run_id": run_id,
                    "state": state,
                    "created_at": created_at,
                    **payload,
                },
            )

    def get(self, run_id):
        with self.connect() as db:
            row = db.execute(
                """
                SELECT runs.*, events.state, events.payload FROM runs
                LEFT JOIN events USING(run_id) WHERE run_id = ?
            """,
                (run_id,),
            ).fetchone()
        if row is None:
            raise ValueError("Unknown run; list experiments before selecting a run.")
        return {
            "run_id": row["run_id"],
            "created_at": row["created_at"],
            "config": json.loads(row["config"]),
            "provenance": json.loads(row["provenance"]),
            "state": row["state"] or "started",
            "result": json.loads(row["payload"]) if row["payload"] else None,
        }

    def list(self, limit=20, offset=0):
        if not 1 <= limit <= 100 or offset < 0:
            raise ValueError("Use a limit from 1 to 100 and a non-negative offset.")
        with self.connect() as db:
            count = db.execute("SELECT COUNT(*) FROM runs").fetchone()[0]
            rows = db.execute(
                """
                SELECT runs.run_id, runs.created_at, runs.config, events.state FROM runs
                LEFT JOIN events USING(run_id)
                ORDER BY runs.created_at DESC, runs.run_id LIMIT ? OFFSET ?
            """,
                (limit, offset),
            ).fetchall()
        return {
            "total_count": count,
            "items": [
                {
                    "run_id": r["run_id"],
                    "created_at": r["created_at"],
                    "recipe": json.loads(r["config"])["recipe"],
                    "state": r["state"] or "started",
                }
                for r in rows
            ],
            "has_more": offset + len(rows) < count,
            "next_offset": offset + len(rows) if offset + len(rows) < count else None,
        }

    def artifact(self, run_id, filename):
        record = self.get(run_id)
        if record["state"] != "succeeded":
            raise ValueError("Only a succeeded run provides verified model artifacts.")
        expected = record["result"]["artifacts"].get(filename)
        if expected is None:
            raise ValueError("That file is not a registered artifact of this run.")
        candidate = self.workspace / "runs" / record["run_id"] / filename
        if sha256_file(candidate) != expected:
            raise ValueError("Artifact hash mismatch; the saved model was modified.")
        return candidate
