// Golden tests: every tool over a real MCP client, replaying deps.dev, npm, raw changelog files
// and GitHub releases recorded by test/record.mjs. No test here touches the network.
import assert from "node:assert/strict";
import test from "node:test";
import { call, connect } from "./replay.mjs";

test("changes_between: breaking changes, removals and requirement changes, each with its version", async () => {
  const client = await connect();
  const { data } = await call(client, "changes_between", { ecosystem: "npm", package: "express", from: "4.21.2", to: "5.0.0" });
  assert.deepEqual([data.package, data.from, data.to, data.major_upgrades], ["express", "4.21.2", "5.0.0", ["5.x"]]);
  assert.match(data.source, /expressjs\/express\/blob\/HEAD\/History\.md$/);
  assert.ok(data.breaking.some((l) => l.startsWith("5.0.0: `res.status()` accepts only integers")), "items under a 'breaking:' label");
  assert.ok(!data.breaking.some((l) => /^5\.0\.0: breaking:?$/.test(l)), "the label itself is not an item");
  assert.ok(data.removed.some((l) => l.includes("Remove `hidden` option")), "pre-release notes count toward the release");
  assert.ok(!data.removed.some((l) => l.includes("DEBUG_HIDE_DATE")), "a sibling 'deps:' item ends the 'remove:' section");
  const requests = await call(client, "changes_between", { ecosystem: "pypi", package: "Requests", from: "2.31.0", to: "2.32.3" });
  assert.ok(requests.data.requirements.includes("2.32.0: Requests has officially dropped support for CPython 3.7"));
  assert.ok(requests.data.security.some((l) => l.includes("verify=False")));
  assert.ok(requests.data.deprecated.some((l) => l.includes("CVE-2024-35195")), "wrapped lines are joined into one item");
});

test("changes_between: GitHub releases when there is no changelog file; bugs mentioning 'incompatible' are not breaking", async () => {
  const client = await connect();
  const { data } = await call(client, "changes_between", { ecosystem: "cargo", package: "serde", from: "1.0.150", to: "1.0.200" });
  assert.equal(data.source, "https://github.com/serde-rs/serde/releases");
  assert.equal(data.versions, 50);
  assert.deepEqual(data.removed, ["1.0.187: Remove support for Emscripten targets on rustc older than 1.40"]);
  assert.equal(data.breaking, undefined);
  const bad = await call(client, "changes_between", { ecosystem: "npm", package: "@babel/core", from: "7.20.0" });
  assert.equal(bad.data.error.code, "unknown_version");
  assert.match(bad.data.error.message, /nearest are 7\.19\.6 and 7\.20\.2/);
});

test("search_changelog: oldest first, with the section label that says what happened", async () => {
  const client = await connect();
  const { data } = await call(client, "search_changelog", { ecosystem: "npm", package: "express", text: "req.param(" });
  assert.equal(data.total, 6);
  assert.match(data.hits[0], /^2\.0\.0beta \(2011-03-03\)/);
  assert.ok(data.hits.some((h) => /^4\.11\.0 \(2015-01-13\).*Deprecate `req\.param\(\)`/.test(h)));
  assert.ok(data.hits.some((h) => /^5\.0\.0-alpha\.2 \(2015-07-06\) \[remove\]: `req\.param\(\)`/.test(h)), "removed in 5.0.0-alpha.2, as its label says");
});

test("release_notes: one version's notes with date and source, clipped to the budget", async () => {
  const client = await connect();
  const { data } = await call(client, "release_notes", { ecosystem: "npm", package: "react", version: "18.0.0", max_chars: 1500 });
  assert.equal(data.date, "2022-03-29");
  assert.match(data.notes, /`useId` is a new hook/);
  const hits = await call(client, "search_changelog", { ecosystem: "npm", package: "react", text: "useId" });
  assert.match(hits.data.hits[0], /^18\.0\.0 \(2022-03-29\) \[react\]: `useId` is a new hook/, "the registry's date where the heading has none");
  assert.ok(data.notes.length <= 1600);
});
