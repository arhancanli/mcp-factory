// Golden tests: both tools over a real MCP client, replaying git tag listings, action.yml files
// and GitHub's runner-images list as recorded by test/record.mjs. No test here touches the network.
import assert from "node:assert/strict";
import test from "node:test";
import { call, connect } from "./replay.mjs";
import { CLEAN, WORKFLOW } from "./scenarios.mjs";

test("check_workflows: every problem in the sample, with file, line and fix, errors first", async () => {
  const client = await connect();
  const { data } = await call(client, "check_workflows", { files: [{ path: ".github/workflows/ci.yml", content: WORKFLOW }] });
  const find = (re) => data.findings.find((f) => re.test(f.issue));
  assert.deepEqual([find(/Script injection/).file, find(/Script injection/).line], [".github/workflows/ci.yml", 18]);
  assert.equal(find(/pull_request_target/).line, 14, "the checkout's ref line");
  assert.equal(find(/pull_request_target/).code, "ref: ${{ github.event.pull_request.head.sha }}", "the line's text travels with its number");
  const node16 = find(/actions\/checkout@v3 runs on Node 16/);
  assert.equal(node16.level, "error");
  assert.match(node16.fix, /^Update to v7\.0\.1 \(runs on Node 24\): actions\/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7\.0\.1$/);
  assert.equal(find(/ubuntu-20\.04 \(matrix\.os\): GitHub no longer provides/).level, "error");
  assert.equal(find(/macos-14: deprecated/).level, "warning");
  assert.equal(find(/::set-output/).line, 20);
  assert.match(find(/does-not-exist-xyz/).issue, /does not exist or is private/);
  assert.match(find(/setup-node@v4\.0\.0 is 3 major versions behind/).fix, /# v7\.0\.0$/);
  assert.match(find(/third-party action/).issue, /^1 third-party action is referenced by tag, which its owner can move: peaceiris\/actions-gh-pages@v3\.$/, "actions/* are GitHub's own");
  assert.ok(find(/No permissions block/));
  const order = ["error", "warning", "info"];
  const ranks = data.findings.map((f) => order.indexOf(f.level));
  assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b));
  assert.deepEqual(data.counts, { error: 6, warning: 4, info: 2 });
});

test("check_workflows: a pinned, current workflow has no findings", async () => {
  const client = await connect();
  const { data } = await call(client, "check_workflows", { files: [{ path: ".github/workflows/test.yml", content: CLEAN }] });
  assert.deepEqual([data.findings, data.counts], [[], {}]);
  assert.deepEqual(data.actions, ["actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 -> v7.0.1, node24"], "the SHA is recognised as the v7.0.1 release");
});

test("action_versions: latest with SHA and runtime, majors, and what a ref points at", async () => {
  const client = await connect();
  const { data } = await call(client, "action_versions", { actions: ["actions/checkout", "actions/setup-node@v4.0.0", "actions/upload-artifact@v3"] });
  const [checkout, node, artifact] = data.results;
  assert.deepEqual([checkout.latest, checkout.latest_runtime, checkout.majors[0]], ["v7.0.1", "node24", "v7: v7.0.1"]);
  assert.deepEqual([node.ref.sha, node.ref.runtime], ["8f152de45cc393bb48ce5d89d36b731f54556e65", "node20"]);
  assert.deepEqual([artifact.ref.kind, artifact.ref.tag, artifact.ref.runtime], ["major", "v3.2.1", "node16"], "a moving major tag names the release it points at");
  assert.match(artifact.note, /newer release exists: v7\.0\.1/);
});

test("runner_labels: status of named labels", async () => {
  const client = await connect();
  const { data } = await call(client, "runner_labels", { labels: ["ubuntu-latest", "macos-14", "ubuntu-20.04", "my-gpu-runner"] });
  assert.deepEqual(data.results.map((r) => r.status), ["available", "deprecated", "retired", "self-hosted"]);
});
