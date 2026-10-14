// An exclusive, flushed journal survives interruption and cannot reset an attempt's allowance.
import { openSync, writeSync, fsyncSync, closeSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { hash } from "../kit/release.mjs";

export const JOURNAL_RUNNER_SHA256 = hash(readFileSync(new URL(import.meta.url)));

export function openJournal(filename, header) {
  mkdirSync(path.dirname(filename), { recursive: true });
  const fd = openSync(filename, "wx", 0o600);
  let closed = false;
  const record = (event) => {
    if (closed) throw new Error("The attempt journal is closed.");
    const bytes = Buffer.from(`${JSON.stringify({ recorded_at: new Date().toISOString(), ...event })}\n`);
    if (bytes.length > 1024 * 1024) throw new Error("A journal event must fit within 1 MiB.");
    let offset = 0;
    while (offset < bytes.length) {
      const written = writeSync(fd, bytes, offset, bytes.length - offset);
      if (!written) throw new Error("The journal did not persist a complete event.");
      offset += written;
    }
    fsyncSync(fd);
  };
  try {
    record({ event: "attempt_started", schema: "canlilabs.benchmark-journal.v1", ...header });
    const directory = openSync(path.dirname(filename), "r");
    try { fsyncSync(directory); } finally { closeSync(directory); }
  }
  catch (error) { closeSync(fd); closed = true; throw error; }
  return { record, close() { if (!closed) { closed = true; closeSync(fd); } } };
}

export function assertJournalUnchanged() {
  if (hash(readFileSync(new URL(import.meta.url))) !== JOURNAL_RUNNER_SHA256) throw new Error("Journal runner changed during execution.");
}
