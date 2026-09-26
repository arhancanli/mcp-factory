// The rules without the network: changelog formats, note lines, classification, repository URLs
// and loosely written versions.
import assert from "node:assert/strict";
import test from "node:test";
import { classify, noteLines, notesFor, parseChangelog } from "../src/changelog.mjs";
import { createContext } from "../src/server.mjs";
import { githubRepo } from "../src/registry.mjs";
import { pickVersion } from "../src/tools/shared.mjs";
import { compareVersions, isPrerelease } from "../src/versions.mjs";

test("changelog formats: Markdown, bracketed with dates, underlined, reST, Unreleased skipped", () => {
  const md = "# Changelog\n\n## [Unreleased]\n- wip\n\n## [2.0.0] - 2024-01-02\n### Removed\n- old API\n\n## 1.9.1 (2023-12-01)\n- fix\n";
  assert.deepEqual(parseChangelog(md).map((e) => [e.version, e.date]), [["2.0.0", "2024-01-02"], ["1.9.1", "2023-12-01"]]);
  const underlined = "5.0.0 / 2024-09-10\n==================\n\n  * breaking:\n    - thing\n\n4.21.2 / 2024-11-06\n===================\n  * fix\n";
  assert.deepEqual(parseChangelog(underlined).map((e) => e.version), ["5.0.0", "4.21.2"]);
  const rst = "Release History\n===============\n\n2.32.3 (2024-05-29)\n-------------------\n\n**Bugfixes**\n- x\n\nv2.32.2\n-------\n- y\n";
  assert.deepEqual(parseChangelog(rst).map((e) => e.version), ["2.32.3", "2.32.2"]);
  assert.deepEqual(parseChangelog("## v7.24.0 (2024-02-28)\n- a\n## 7.24.0-beta.1\n- b").map((e) => e.version), ["7.24.0", "7.24.0-beta.1"]);
});

test("note lines: wrapped bullets joined, links and PR noise removed", () => {
  const text = "- Versions of Requests between v2.3.0 and v2.30.0 are vulnerable to potential\n  forwarding of headers. (#6428)\n* Add [docs](https://x.y) by @someone in https://github.com/o/r/pull/9\n\n**Full Changelog**: https://x";
  assert.deepEqual(noteLines(text), ["Versions of Requests between v2.3.0 and v2.30.0 are vulnerable to potential forwarding of headers.", "Add docs"]);
});

test("classification: labels give their lines a kind until a sibling item; explicit markers only", () => {
  const lines = noteLines("* breaking:\n  - `res.status()` accepts only integers\n* remove:\n  - `x` option\n* deps: debug@3.1.0\n  - Add `Y` variable\n* Drop support for Node.js 16\n* Fix crash on incompatible object\n* Fixed bug breaking the ability to set headers\n* BREAKING: renamed `a` to `b`\n* Deprecate `foo()`\n* Fix CVE-2024-1234");
  const c = classify(lines);
  assert.deepEqual(c.breaking, ["`res.status()` accepts only integers", "BREAKING: renamed `a` to `b`"]);
  assert.deepEqual(c.removed, ["`x` option", "Drop support for Node.js 16"]);
  assert.deepEqual(c.requirements, ["Drop support for Node.js 16"]);
  assert.deepEqual(c.deprecated, ["Deprecate `foo()`"]);
  assert.deepEqual(c.security, ["Fix CVE-2024-1234"]);
});

test("repositories and versions: every GitHub URL form; loose versions resolve to published ones", () => {
  assert.deepEqual(githubRepo("git+https://github.com/expressjs/express.git"), { owner: "expressjs", repo: "express", directory: undefined });
  assert.deepEqual(githubRepo("github:babel/babel"), { owner: "babel", repo: "babel", directory: undefined });
  assert.deepEqual(githubRepo("https://github.com/babel/babel/tree/main/packages/babel-core"), { owner: "babel", repo: "babel", directory: "packages/babel-core" });
  assert.equal(githubRepo("https://gitlab.com/a/b"), undefined);
  const versions = ["4.9.0", "4.10.0", "5.0.0-beta.1", "5.0.0", "5.0.1"].map((version) => ({ version }));
  assert.equal(pickVersion(versions, "v5"), "5.0.1");
  assert.equal(pickVersion(versions, "4.x"), "4.10.0");
  assert.equal(pickVersion(versions, "5.0.0"), "5.0.0");
  assert.equal(pickVersion(versions, "6"), undefined);
  assert.ok(compareVersions("4.10.0", "4.9.0") > 0 && compareVersions("5.0.0-beta.1", "5.0.0") < 0);
  assert.ok(isPrerelease("5.0.0-beta.1") && isPrerelease("1.0.0rc1") && !isPrerelease("2.0.0.post1"));
});

test("a changelog file that covers only the newest major is completed from GitHub releases", async () => {
  const fetchImpl = async (url) => {
    const u = String(url);
    if (u.endsWith("/HEAD/CHANGELOG.md")) return new Response("## 8.1.0\n- new\n\n## 8.0.0\n- BREAKING: all of it\n", { status: 200 });
    if (u.includes("raw.githubusercontent.com")) return new Response("404", { status: 404 });
    if (u.includes("/releases?")) return new Response(JSON.stringify(u.includes("page=1") ? [{ tag_name: "v7.24.0", body: "- Deprecate `x`", published_at: "2024-02-28T00:00:00Z", html_url: "https://g/r/7.24.0" }, { tag_name: "v8.0.0", body: "dup", published_at: "2025-01-01T00:00:00Z" }] : []), { status: 200 });
    return new Response("{}", { status: 404 });
  };
  const ctx = createContext({ fetchImpl, env: {} });
  const pkg = { name: "@x/core", repo: { owner: "x", repo: "x" } };
  const onlyFile = await notesFor(ctx, pkg, (v) => v.startsWith("8."));
  assert.equal(onlyFile.source.kind, "CHANGELOG.md", "the file suffices for 8.x");
  const both = await notesFor(ctx, pkg, (v) => v.startsWith("7."));
  assert.equal(both.source.kind, "CHANGELOG.md and GitHub releases");
  assert.deepEqual(both.entries.map((e) => e.version), ["8.1.0", "8.0.0", "7.24.0"], "releases fill in only what the file lacks");
});
