import assert from "node:assert/strict";
import test from "node:test";
import { notesFor } from "../src/changelog.mjs";

test("an undated upstream heading uses the registry date without changing the version or note", async () => {
  const text = "4.11.0\n======\n* Deprecate `req.param()`\n\n4.10.0\n======\n* Earlier release\n";
  const ctx = { fetcher: { request: async (url) => url.endsWith("/History.md") ? { ok: true, text } : { ok: false, text: "" } } };
  const notes = await notesFor(ctx, { name: "express", repo: { owner: "expressjs", repo: "express" }, versions: [{ version: "4.11.0", date: "2015-01-14" }] });
  const entry = notes.entries.find((e) => e.version === "4.11.0");
  assert.equal(entry.date, "2015-01-14");
  assert.match(entry.text, /Deprecate `req\.param\(\)`/);
});
