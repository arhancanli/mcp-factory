"""Content-addressed artifacts and an append-only experiment event ledger."""

import hashlib
import importlib.metadata
import json
import os
import platform
import re
import sqlite3
import sys
import tempfile
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


def write_bytes(path, value):
    """Publish complete, flushed bytes atomically without replacing existing content."""
    destination = Path(path)
    destination.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(prefix=".pending-", dir=destination.parent)
    try:
        with os.fdopen(descriptor, "wb") as stream:
            stream.write(value)
            stream.flush()
            os.fsync(stream.fileno())
        os.link(temporary, destination)
        directory = os.open(destination.parent, os.O_RDONLY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        os.unlink(temporary)


def write_json(path, value):
    # Serialize before creating a file: NaN or an unserializable value leaves no partial receipt.
    value = (json.dumps(value, indent=2, sort_keys=True, allow_nan=False) + "\n").encode()
    write_bytes(path, value)


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

    @staticmethod
    def _run_id(run_id):
        if not isinstance(run_id, str) or not re.fullmatch(r"[a-f0-9]{32}", run_id):
            raise ValueError("Run ID must be a 32-character ID returned by runs.")

    @staticmethod
    def _receipt(path, document):
        if path.exists():
            if json.loads(path.read_text()) != document:
                raise ValueError("A derived receipt differs from the authoritative ledger.")
            return
        write_json(path, document)

    def _start(self, config, leased=False):
        run_id = uuid.uuid4().hex
        directory = self.workspace / "runs" / run_id
        directory.mkdir(parents=True, exist_ok=False)
        lease = None
        try:
            if leased:
                import fcntl

                lease = (directory / ".worker.lock").open("x+b")
                # Acquire before making the started run visible in SQLite.
                fcntl.flock(lease, fcntl.LOCK_EX | fcntl.LOCK_NB)
            provenance = {"code": source_fingerprint(), "environment": environment()}
            if leased:
                identity = os.fstat(lease.fileno())
                provenance["worker_lease"] = {
                    "protocol": "posix-flock.v2",
                    "file": ".worker.lock",
                    "device": identity.st_dev,
                    "inode": identity.st_ino,
                }
            created_at = datetime.now(UTC).isoformat()
            with self.connect() as db:
                db.execute(
                    "INSERT INTO runs VALUES (?, ?, ?, ?)",
                    (run_id, created_at, canonical(config), canonical(provenance)),
                )
            try:
                write_json(
                    directory / "started.json",
                    {
                        "run_id": run_id,
                        "created_at": created_at,
                        "config": config,
                        "provenance": provenance,
                    },
                )
            except OSError:
                # SQLite is authoritative. Missing derived receipts can be repaired.
                pass
        except BaseException:
            if lease:
                lease.close()
            raise
        return run_id, directory, lease

    def start(self, config):
        """Create an administrative trial. Training workers must use active_run."""
        run_id, directory, _lease = self._start(config)
        return run_id, directory

    @contextmanager
    def active_run(self, config):
        """An OS-held lease prevents recovery from stopping a live training worker."""
        run_id, directory, lease = self._start(config, leased=True)
        try:
            yield run_id, directory
        finally:
            lease.close()

    def finish(self, run_id, state, payload):
        self._run_id(run_id)
        serialized = canonical(payload)
        created_at = datetime.now(UTC).isoformat()
        with self.connect() as db:
            db.execute(
                "INSERT INTO events(run_id, state, created_at, payload) VALUES (?, ?, ?, ?)",
                (run_id, state, created_at, serialized),
            )
        try:
            self._receipt(
                self.workspace / "runs" / run_id / "finished.json",
                {
                    **payload,
                    "run_id": run_id,
                    "state": state,
                    "created_at": created_at,
                },
            )
        except (OSError, ValueError):
            # Never convert a committed success to a failure because a receipt write failed.
            return False
        return True

    def repair_receipts(self, run_id):
        self._run_id(run_id)
        record = self.get(run_id)
        directory = self.workspace / "runs" / run_id
        self._receipt(
            directory / "started.json",
            {key: record[key] for key in ["run_id", "created_at", "config", "provenance"]},
        )
        if record["state"] != "started":
            with self.connect() as db:
                event = db.execute(
                    "SELECT created_at FROM events WHERE run_id = ?", (run_id,)
                ).fetchone()
            self._receipt(
                directory / "finished.json",
                {
                    **record["result"],
                    "run_id": run_id,
                    "state": record["state"],
                    "created_at": event["created_at"],
                },
            )
        return {"run_id": run_id, "state": record["state"], "receipts_verified": True}

    def recover(self, run_id, reason):
        """Explicitly fail an abandoned trial; an active OS lease always blocks recovery."""
        import fcntl

        self._run_id(run_id)
        if not isinstance(reason, str) or not reason.strip() or len(reason) > 1024:
            raise ValueError("Recovery requires a non-empty reason of at most 1,024 characters.")
        record = self.get(run_id)
        expected = record["provenance"].get("worker_lease", {})
        if expected.get("protocol") != "posix-flock.v2":
            raise ValueError("Legacy/unleased trials need an offline audit before recovery.")
        path = self.workspace / "runs" / run_id / ".worker.lock"
        if not path.exists() or path.is_symlink():
            raise ValueError("The worker lease file is missing or replaced; recovery refused.")
        with path.open("r+b") as lease:
            actual = os.fstat(lease.fileno())
            if (actual.st_dev, actual.st_ino) != (expected["device"], expected["inode"]):
                raise ValueError("The worker lease file was replaced; recovery refused.")
            try:
                fcntl.flock(lease, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError as error:
                raise ValueError("The training worker is active; recovery refused.") from error
            if self.get(run_id)["state"] != "started":
                raise ValueError("Only an unfinished started trial can be recovered.")
            self.finish(
                run_id,
                "failed",
                {"error_type": "InterruptedRun", "message": reason, "recovered": True},
            )
        return self.get(run_id)

    def get(self, run_id):
        self._run_id(run_id)
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
        if not isinstance(filename, str) or not re.fullmatch(
            r"[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}", filename
        ):
            raise ValueError("Artifact names must be bounded filenames without path components.")
        record = self.get(run_id)
        if record["state"] != "succeeded":
            raise ValueError("Only a succeeded run provides verified model artifacts.")
        expected = record["result"]["artifacts"].get(filename)
        if expected is None:
            raise ValueError("That file is not a registered artifact of this run.")
        candidate = self.workspace / "runs" / record["run_id"] / filename
        if candidate.is_symlink():
            raise ValueError("Registered artifacts cannot be symbolic links.")
        if sha256_file(candidate) != expected:
            raise ValueError("Artifact hash mismatch; the saved model was modified.")
        return candidate
