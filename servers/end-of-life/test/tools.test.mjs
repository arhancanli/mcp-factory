// Golden tests: every tool over a real MCP client, replaying endoflife.date responses recorded by
// test/record.mjs with the clock fixed at 2026-09-26. No test here touches the network.
import assert from "node:assert/strict";
import test from "node:test";
import { call, connect } from "./replay.mjs";
import { PROJECT } from "./scenarios.mjs";

const find = (rows, file, product) => rows.find((r) => r.file === file && r.product === product);

test("check_project: versions found in each file, with file, line and status, worst first", async () => {
  const client = await connect();
  const { res, data } = await call(client, "check_project", { files: PROJECT });
  assert.ok(!res.isError);
  const node = find(data.results, "Dockerfile", "nodejs");
  assert.deepEqual([node.version, node.line, node.status], ["18", 1, "end_of_life"]);
  assert.equal(node.upgrade_to.cycle, "24", "the newest LTS");
  assert.equal(node.nearest_supported.cycle, "22", "the smallest jump that still gets fixes");
  assert.equal(find(data.results, "Dockerfile", "alpine-linux").version, "3.17", "the OS inside the image tag");
  assert.equal(find(data.results, "Dockerfile", "debian").version, "11", "bullseye is Debian 11");
  assert.equal(find(data.results, ".nvmrc", "nodejs").version, "18", "lts/hydrogen is Node.js 18");
  const ubuntu = find(data.results, ".github/workflows/ci.yml", "ubuntu");
  assert.equal(ubuntu.status, "extended_only");
  assert.ok(ubuntu.days_left > 0, "counted to the end of extended support, never negative");
  assert.equal(find(data.results, "pyproject.toml", "python").version, "3.10", "the lowest version a range allows");
  assert.deepEqual(data.unrecognised_files, ["README.md"]);
  const order = ["end_of_life", "extended_only", "security_only", "unknown_version", "upcoming", "supported"];
  const statuses = data.results.map((r) => order.indexOf(r.status));
  assert.deepEqual(statuses, [...statuses].sort((a, b) => a - b), "worst first");
});

test("check_versions: aliases and separators resolve; unknown products are reported, not guessed", async () => {
  const client = await connect();
  const { data } = await call(client, "check_versions", { items: ["python 3.8", "node@18", "postgres:13", "ubuntu 20.04", "django 4.2", "nonsense 1.0"] });
  const by = Object.fromEntries(data.results.map((r) => [r.product, r]));
  assert.equal(by.python.status, "end_of_life");
  assert.equal(by.python.eol, "2024-10-07");
  assert.equal(by.python.nearest_supported.cycle, "3.10");
  assert.equal(by.nodejs.cycle, "18");
  assert.equal(by.postgresql.cycle, "13");
  assert.equal(by.nonsense.status, "unknown_product");
  assert.ok(data.counts.end_of_life >= 4);
});

test("product_lifecycle: live cycles with dates and days left, a few ended ones, and the upgrade target", async () => {
  const client = await connect();
  const { data } = await call(client, "product_lifecycle", { product: "node" });
  assert.equal(data.product, "nodejs");
  const live = data.cycles.filter((c) => c.status !== "end_of_life");
  assert.ok(live.every((c) => c.days_left > 0));
  assert.equal(data.cycles.filter((c) => c.status === "end_of_life").length, 3);
  assert.equal(data.upgrade_to.cycle, "24");
  assert.equal(data.upgrade_to.lts, true);
});

test("check_project: files without pinned versions are a clear error", async () => {
  const client = await connect();
  const { res, data } = await call(client, "check_project", { files: [{ path: "README.md", content: "x" }] });
  assert.equal(res.isError, true);
  assert.equal(data.error.code, "nothing_found");
});
