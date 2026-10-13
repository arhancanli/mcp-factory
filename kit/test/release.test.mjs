// Release failures are exercised against real Git snapshots and paired raw task records.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { assertRegistryKnown, benchmarkVerdict, hash, identityHash, registryVersion, releaseVerdict, sourceSnapshot } from "../release.mjs";

const now = Date.parse("2026-10-14T08:00:00Z");
const stamp = new Date(now).toISOString();
const spec = {
  competitor: { label: "Fixed reference", command: "npx", args: ["-y", "reference-mcp@1.2.3"], identity: { kind: "npm", name: "reference-mcp", version: "1.2.3" } },
  tasks: Array.from({ length: 10 }, (_, i) => ({ id: `task-${i}`, prompt: `Return case ${i}`, expect: { number: i } })),
};
const rawRows = (input = 100) => spec.tasks.map((task, i) => ({ id: task.id, correct: true, final_text: `ANSWER: ${i}`, resolved_model: "fixed-model-1", input, output: 10, cache_read: 0, cache_write: 0, tool_calls: 1, ms: 100 }));
const benchmark = (source) => ({ schema: "canlilabs.benchmark.v2", measured_at: stamp, provider: "test", model: "fixed-model-1", provenance: { source_sha256: source.sha256, tasks_sha256: identityHash(spec), competitor_sha256: identityHash(spec.competitor), runner_sha256: "a".repeat(64) }, rows: { ours: rawRows(100), competitor: rawRows(200) } });

test("incumbent identity preserves array order and ignores irrelevant object key order", () => {
  assert.equal(identityHash({ kind: "npm", name: "reference", version: "1.2.3" }), identityHash({ version: "1.2.3", name: "reference", kind: "npm" }));
  assert.notEqual(identityHash(["first", "second"]), identityHash(["second", "first"]));
});

function fixture(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), "release-proof-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const directory = path.join(root, "servers/demo");
  mkdirSync(path.join(directory, "src"), { recursive: true });
  mkdirSync(path.join(directory, "bench/results"), { recursive: true });
  writeFileSync(path.join(directory, "package.json"), JSON.stringify({ name: "demo-mcp", version: "0.1.0" }));
  writeFileSync(path.join(directory, "src/server.mjs"), "export const version = '0.1.0';\n");
  writeFileSync(path.join(directory, "bench/tasks.json"), JSON.stringify(spec));
  writeFileSync(path.join(directory, "README.md"), "Recorded reports\n");
  writeFileSync(path.join(directory, ".gitignore"), "node_modules/\n*.tgz\n");
  const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  git("init", "-q");
  git("config", "user.name", "Arhan Canli");
  git("config", "user.email", "315329124+arhancanli@users.noreply.github.com");
  git("config", "commit.gpgsign", "false");
  git("add", ".");
  git("commit", "-qm", "Fixture source");
  return { root, directory, git };
}

test("snapshots bind code and fixed corpus while measured reports leave inputs stable", (t) => {
  const { directory, git } = fixture(t);
  const original = sourceSnapshot(directory);
  writeFileSync(path.join(directory, "README.md"), "New measured table\n");
  writeFileSync(path.join(directory, "bench/perf.json"), "{}");
  writeFileSync(path.join(directory, "bench/results/run.json"), "{}");
  assert.equal(sourceSnapshot(directory).sha256, original.sha256);
  git("add", "."); git("commit", "-qm", "Fixture reports");
  const measured = sourceSnapshot(directory, { ref: "HEAD" });
  assert.equal(measured.sha256, original.sha256);
  assert.notEqual(measured.tree, original.tree);
  writeFileSync(path.join(directory, "src/server.mjs"), "export const version = '0.2.0';\n");
  assert.notEqual(sourceSnapshot(directory).sha256, original.sha256);
  assert.equal(sourceSnapshot(directory, { ref: "HEAD" }).sha256, original.sha256);
});

test("release benchmark is regraded from identical raw answers and complete usage", () => {
  const source = { sha256: "b".repeat(64) };
  const result = benchmark(source);
  assert.equal(benchmarkVerdict(result, spec, source, { now }).passed, true);
  result.rows.ours[0].final_text = "ANSWER: 99";
  assert.equal(benchmarkVerdict(result, spec, source, { now }).passed, false);
  result.rows.ours[0].correct = false;
  assert.equal(benchmarkVerdict(result, spec, source, { now }).passed, false, "accuracy regresses even with fewer tokens");
});

test("low accuracy, stale/changed sources, unpinned incumbents and incomplete arms cannot ship", () => {
  const source = { sha256: "b".repeat(64) };
  for (const mutate of [
    (r) => { r.provenance.source_sha256 = "c".repeat(64); },
    (r) => { r.measured_at = "2026-01-01T00:00:00Z"; },
    (r) => { r.rows.competitor.pop(); },
    (r) => { r.rows.ours[0].input = NaN; },
    (r) => { r.rows.competitor[0].resolved_model = "different-model"; },
    (r) => { r.rows.ours[0].error = "API unavailable"; },
  ]) {
    const result = benchmark(source); mutate(result);
    assert.equal(benchmarkVerdict(result, spec, source, { now }).passed, false);
  }
  const unpinned = structuredClone(spec); unpinned.competitor.args = ["-y", "reference-mcp@latest"];
  assert.equal(benchmarkVerdict(benchmark(source), unpinned, source, { now }).passed, false);
  const useless = benchmark(source);
  for (const arm of Object.values(useless.rows)) for (const row of arm) { row.final_text = "ANSWER: 99"; row.correct = false; }
  assert.equal(benchmarkVerdict(useless, spec, source, { now }).passed, false, "zero useful answers are not a token win");
});

test("only a definitive 404 is missing; authentication, throttling, malformed bodies and outages remain unknown", async () => {
  for (const status of [401, 403, 429, 500, 503]) {
    const result = await registryVersion("demo-mcp", "0.1.0", { fetcher: async () => new Response("{}", { status }) });
    assert.equal(result.state, "unknown");
    assert.throws(() => assertRegistryKnown(result), /blocked/);
  }
  const missing = await registryVersion("demo-mcp", "0.1.0", { fetcher: async () => new Response("{}", { status: 404 }) });
  assert.equal(assertRegistryKnown(missing).state, "missing");
  const invalid = await registryVersion("demo-mcp", "0.1.0", { fetcher: async () => new Response("invalid") });
  assert.equal(invalid.state, "unknown");
  const lost = await registryVersion("demo-mcp", "0.1.0", { fetcher: async () => { throw new Error("connection reset"); } });
  assert.equal(lost.state, "unknown");
  const published = await registryVersion("demo-mcp", "0.1.0", { fetcher: async () => new Response(JSON.stringify({ name: "demo-mcp", version: "0.1.0", dist: { integrity: "sha512-abcd==" } })) });
  assert.equal(published.state, "published");
});

test("a full certificate requires hashes, actual logs and exact packed tree, using committed package inputs", async (t) => {
  const { directory } = fixture(t);
  const source = sourceSnapshot(directory, { ref: "HEAD" });
  const documents = new Map();
  const add = (file, value) => {
    const bytes = Buffer.from(typeof value === "string" ? value : JSON.stringify(value));
    documents.set(file, bytes); return { path: file, sha256: hash(bytes) };
  };
  const checks = {};
  for (const kind of ["factory", "standalone", "canary", "audit"]) {
    const log = kind === "audit" ? { metadata: { vulnerabilities: { high: 0, critical: 0 } } } : "# tests 4\n# pass 4\n# fail 0\n";
    checks[kind] = { exit_code: 0, tests: 4, log: add(`docs/quality/${kind}.log`, log) };
  }
  Object.assign(checks.standalone, { tree: source.tree, initialize: true, tools_list: true, packed_integrity: "sha512-abcd==" });
  const scout = { schema: "canlilabs.scout.v1", server: "demo", reviewed_at: stamp, demand: [{ url: "https://example.invalid/demand", signal: "Independent requests", observed_at: stamp }], source: { url: "https://example.invalid/source", license: "MIT", cost: "free", rate_limits: "10/min" }, incumbent: { identity: spec.competitor.identity, url: "https://example.invalid/incumbent", selection_reason: "The strongest maintained candidate for the fixed niche." } };
  const quality = { schema: "canlilabs.quality.v1", source_sha256: source.sha256, tree: source.tree, measured_at: stamp, checks };
  const perf = { schema: "canlilabs.performance.v2", measured_at: stamp, provenance: { source_sha256: source.sha256, competitor_sha256: identityHash(spec.competitor) }, tool_definition_chars: 100, tools_list_chars: 200, scenarios: [{ first_call_ms: 10, repeat_ms: 1, result_chars: 10 }] };
  const certificate = { schema: "canlilabs.release.v1", server: "demo", package: { name: "demo-mcp", version: "0.1.0" }, source_sha256: source.sha256, tree: source.tree, created_at: stamp, evidence: { scout: add("docs/scout/demo.json", scout), quality: add("docs/quality/demo.json", quality), benchmark: add("servers/demo/bench/results/run.json", benchmark(source)), performance: add("servers/demo/bench/perf.json", perf) } };
  const readEvidence = async (file) => documents.get(file);
  const options = { directory, name: "demo", source, certificate, readEvidence, now };
  assert.equal((await releaseVerdict(options)).ready, true);
  // A working-tree edit cannot replace the package version anchored to the committed snapshot.
  writeFileSync(path.join(directory, "package.json"), JSON.stringify({ name: "other-mcp", version: "9.0.0" }));
  assert.equal((await releaseVerdict(options)).ready, true);
  documents.set("docs/quality/factory.log", Buffer.from("# tests 0\n# pass 0\n# fail 0\n"));
  assert.equal((await releaseVerdict(options)).ready, false);
  certificate.tree = "f".repeat(40);
  assert.equal((await releaseVerdict(options)).ready, false);
});
