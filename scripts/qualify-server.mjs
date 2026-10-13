#!/usr/bin/env node
// Executes free technical stations. Benchmark and scout requirements still decide eligibility.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ROOT } from "./lib.mjs";
import { assertCommitted } from "./export.mjs";
import { checkStandalone } from "./check-standalone.mjs";
import { serverName } from "./release-readiness.mjs";
import { hash, sourceSnapshot } from "../kit/release.mjs";

export async function qualify(name) {
  serverName(name);
  assertCommitted(name);
  const directory = path.join(ROOT, "servers", name);
  const source = sourceSnapshot(directory, { ref: "HEAD" });
  if (sourceSnapshot(directory).sha256 !== source.sha256) throw new Error("Commit current executable source before qualifying it.");
  const now = new Date().toISOString();
  const prefix = `docs/quality/${name}/${source.sha256}/${now.replace(/[:.]/g, "-")}`;
  const checks = {};
  const { NODE_TEST_CONTEXT, ...env } = process.env;
  const run = (command, args, cwd = ROOT) => execFileSync(command, args, {
    cwd, env, encoding: "utf8", timeout: 240_000, maxBuffer: 8 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const save = (station, text) => {
    const file = `${prefix}-${station}.log`;
    mkdirSync(path.dirname(path.join(ROOT, file)), { recursive: true });
    writeFileSync(path.join(ROOT, file), text, { flag: "wx" });
    return { path: file, sha256: hash(text) };
  };
  const factory = run("npm", ["test"]);
  const tests = Number(factory.match(/^(?:# |\u2139 )pass (\d+)/m)?.[1] ?? 0);
  if (!tests || !/^(?:# |\u2139 )fail 0$/m.test(factory)) throw new Error("Factory tests did not pass.");
  checks.factory = { exit_code: 0, tests, log: save("factory", factory) };
  const standalone = await checkStandalone(name);
  const { log, ...details } = standalone;
  checks.standalone = { ...details, exit_code: 0, log: save("standalone", log) };
  const audit = run("npm", ["audit", "--audit-level=high", "--json"], directory);
  checks.audit = { exit_code: 0, log: save("audit", audit) };
  if (!existsSync(path.join(directory, "test/live.canary.mjs"))) throw new Error("A live canary is required.");
  const canary = run(process.execPath, ["--test", "test/live.canary.mjs"], directory);
  checks.canary = { exit_code: 0, log: save("canary", canary) };
  if (sourceSnapshot(directory).sha256 !== source.sha256) throw new Error("Source changed during qualification; retain logs and repeat on a committed snapshot.");
  const result = { schema: "canlilabs.quality.v1", measured_at: now, source_sha256: source.sha256,
    tree: source.tree, verifier_sha256: hash(readFileSync(new URL(import.meta.url))), node: process.version, checks };
  const file = `${prefix}.json`;
  writeFileSync(path.join(ROOT, file), `${JSON.stringify(result, null, 2)}\n`, { flag: "wx" });
  return { path: file, ...result };
}

if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  try { process.stdout.write(`${JSON.stringify(await qualify(process.argv[2]), null, 2)}\n`); }
  catch (error) { process.stderr.write(`Qualification failed: ${error.message}\n`); process.exitCode = 1; }
}
