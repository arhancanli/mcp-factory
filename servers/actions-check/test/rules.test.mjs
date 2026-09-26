// The rules without the network: workflow scanning, uses parsing, versions from tags, runner labels.
import assert from "node:assert/strict";
import test from "node:test";
import { labelStatus } from "../src/runners.mjs";
import { parseUses, refKind, versionsOf } from "../src/refs.mjs";
import { scanWorkflow } from "../src/workflow.mjs";

test("uses: owner/repo/path@ref; local and docker actions skipped", () => {
  assert.deepEqual(parseUses("github/codeql-action/init@v3"), { owner: "github", repo: "codeql-action", path: "init", ref: "v3", full: "github/codeql-action/init" });
  assert.equal(parseUses("./.github/actions/setup"), undefined);
  assert.equal(parseUses("docker://alpine:3.19"), undefined);
});

test("versions from tags: pre-releases ignored, newest per major, SHA pins recognised", () => {
  const tags = new Map([["v1", "a1"], ["v1.2.0", "a1"], ["v2.0.0-beta.1", "b0"], ["v2.0.0", "b1"], ["v2.9.0", "b9"], ["v2.10.0", "b2"], ["v2", "b2"], ["release-candidate", "zz"]]);
  const v = versionsOf(tags);
  assert.equal(v.latest, "v2.10.0", "10 after 9: versions, not strings");
  assert.equal(v.majors.get(1), "v1.2.0");
  const refs = { tags, branches: new Map([["main", "cc"]]) };
  assert.deepEqual(refKind(refs, "v2"), { kind: "major", sha: "b2", tag: "v2.10.0" });
  assert.deepEqual(refKind(refs, "main"), { kind: "branch", sha: "cc" });
  assert.equal(refKind(refs, "b1".padEnd(40, "0")).kind, "sha");
  assert.equal(refKind(refs, "v9").kind, "missing");
});

test("scanning: injection only in scripts, env use is safe; commands; matrix runners; triggers", () => {
  const wf = [
    "on: [issues, push]",
    "jobs:",
    "  a:",
    "    runs-on: ${{ matrix.os }}",
    "    strategy:",
    "      matrix:",
    "        os: [ubuntu-22.04, windows-2019]",
    "    steps:",
    "      - run: echo \"${{ github.event.issue.title }}\"",
    "      - env:",
    "          TITLE: ${{ github.event.issue.body }}",
    "        run: echo \"$TITLE\"",
    "      - run: |",
    "          echo hi",
    "          echo \"::save-state name=a::b\"",
    "      - uses: actions/checkout@v4",
    "        with:",
    "          ref: ${{ github.event.pull_request.head.sha }}",
  ].join("\n");
  const s = scanWorkflow(wf);
  assert.deepEqual(s.findings.map((f) => [f.line, f.issue.slice(0, 27)]), [[9, "Script injection: ${{ githu"], [15, "Deprecated workflow command"]], "env is the safe pattern; no pull_request_target, so the checkout is fine");
  assert.match(s.findings[1].issue, /::save-state/);
  assert.deepEqual(s.runsOn.map((r) => r.label), ["ubuntu-22.04", "windows-2019"]);
  assert.deepEqual(s.triggers.sort(), ["issues", "push"]);
  assert.equal(s.hasPermissions, false);
});

test("runner labels: listed ones by status; hosted-looking unlisted ones retired; others self-hosted", () => {
  const labels = new Map([["ubuntu-latest", "available"], ["macos-14", "deprecated"]]);
  assert.equal(labelStatus(labels, "ubuntu-latest"), "available");
  assert.equal(labelStatus(labels, "MACOS-14"), "deprecated");
  assert.equal(labelStatus(labels, "ubuntu-20.04"), "retired");
  assert.equal(labelStatus(labels, "my-gpu-box"), "self-hosted");
  assert.equal(labelStatus(null, "ubuntu-20.04"), "unknown");
});
