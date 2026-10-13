import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { gitPlan, parseSelectedNames, planChecks } from "../scripts/ci-plan.mjs";

const names = ["alpha-check", "beta-check", "gamma-check"];

test("only the changed package and its launch material need standalone checks", () => {
  const plan = planChecks({ names, changed: ["servers/beta-check/src/server.mjs", "servers/beta-check/test/fixtures/response.json", "marketing/alpha-check.md", "marketing/dist/alpha-check.md"] });
  assert.equal(plan.mode, "selected");
  assert.deepEqual(plan.servers, ["alpha-check", "beta-check"]);
  assert.equal(plan.shards.length, 1);
  assert.deepEqual(JSON.parse(plan.shards[0].names_json), plan.servers);
});

test("every global dependency and uncertain path widens to the whole collection", () => {
  for (const file of ["kit/http.mjs", "kit/test/http.test.mjs", "templates/repo/Dockerfile", "templates/server/src/server.mjs", "scripts/export.mjs", "gate/repo.test.mjs", "bench/run.mjs", ".github/workflows/ci.yml", "package.json", "package-lock.json", "factory.config.json", "catalog.json", "README.md", ".gitignore", "new-root-file.txt", "servers/beta-check/package.json", "servers/beta-check/server.json", "servers/removed-check/src/server.mjs", "servers/beta-check/../src/server.mjs", "servers/beta-check/src/line\nbreak.mjs"]) {
    const plan = planChecks({ names, changed: [file] });
    assert.equal(plan.mode, "all", file);
    assert.deepEqual(plan.servers, names, file);
  }
});

test("documentation and laboratory edits skip independent package installs while the root gate remains", () => {
  const plan = planChecks({ names, changed: ["docs/goal/STATUS.md", "docs/quality/beta-check/receipt.json", "lab/src/canlilabs/recipes.py", "AGENTS.md"] });
  assert.equal(plan.mode, "none");
  assert.equal(plan.selected_server_count, 0);
  assert.deepEqual(plan.shards, []);
  assert.deepEqual(planChecks({ names, forceAll: true }).servers, names);
});

test("explicit selections reject duplicates, traversal, options, unknown and empty names", () => {
  assert.deepEqual(parseSelectedNames('["beta-check","alpha-check"]', names), ["alpha-check", "beta-check"]);
  for (const raw of ['[]', '["beta-check","beta-check"]', '["../alpha-check"]', '["--all"]', '["missing-check"]', '{}', 'null', '[1]', 'bad-json']) {
    assert.throws(() => parseSelectedNames(raw, names), undefined, raw);
  }
});

test("two thousand and larger synthetic collections are deterministic and never omit or duplicate checks", () => {
  // Synthetic identities exercise scheduling only; these are not built or released servers.
  for (const count of [0, 1, 64, 65, 100, 500, 2000, 10000]) {
    const collection = Array.from({ length: count }, (_, index) => `probe-${String(index).padStart(5, "0")}`);
    const plan = planChecks({ names: collection, forceAll: true });
    assert.ok(plan.shards.length <= 16);
    assert.equal(plan.max_parallel, 4);
    const flattened = plan.shards.flatMap((shard) => JSON.parse(shard.names_json));
    assert.deepEqual(flattened, collection);
    assert.equal(plan.selected_server_count, count);
    assert.deepEqual(plan, planChecks({ names: [...collection].reverse(), forceAll: true }));
  }
});

test("real Git rename/deletion paths and unavailable bases cannot silently reduce coverage", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "canlilabs-ci-plan-"));
  const git = (...args) => execFileSync("git", args, { cwd: directory, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const put = (file, content) => { mkdirSync(path.dirname(path.join(directory, file)), { recursive: true }); writeFileSync(path.join(directory, file), content); };
  const commit = () => { git("add", "-A"); git("commit", "-m", "Fixture change"); return git("rev-parse", "HEAD"); };
  try {
    git("init", "-q"); git("config", "user.name", "Arhan Canli"); git("config", "user.email", "315329124+arhancanli@users.noreply.github.com"); git("config", "commit.gpgsign", "false");
    for (const name of names) { put(`servers/${name}/package.json`, "{}\n"); put(`servers/${name}/src/old.mjs`, "export const value = 1;\n"); }
    const base = commit();
    git("mv", "servers/beta-check/src/old.mjs", "servers/beta-check/src/new.mjs");
    const head = commit();
    assert.deepEqual(gitPlan({ directory, base, head }).servers, ["beta-check"]);
    assert.equal(gitPlan({ directory, base: "f".repeat(40), head }).mode, "all");
    assert.equal(gitPlan({ directory, base: "--bad", head }).mode, "all");
    git("rm", "-r", "servers/beta-check"); commit();
    const deletion = gitPlan({ directory, base: head });
    assert.equal(deletion.mode, "all");
    assert.deepEqual(deletion.servers, ["alpha-check", "gamma-check"]);
    put("servers/orphan-check/src/server.mjs", "export {};\n"); commit();
    assert.throws(() => gitPlan({ directory, base: head }), /no committed package/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
