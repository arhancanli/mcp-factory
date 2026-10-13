#!/usr/bin/env node
// Reports shipping eligibility from committed, source-bound station evidence. Does not publish.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { ROOT, listServerDirs } from "./lib.mjs";
import { assertCommitted } from "./export.mjs";
import { committedFile, hash, releaseVerdict, sourceSnapshot, RELEASE_SCHEMA } from "../kit/release.mjs";

export function serverName(name) {
  if (!/^[a-z][a-z0-9-]{1,40}$/.test(name ?? "") || !existsSync(path.join(ROOT, "servers", name, "package.json"))) throw new Error("Choose an existing lowercase server name.");
  return name;
}

export const receiptPath = (name, tree) => `docs/releases/${name}/${tree}.json`;

export async function checkRelease(name, { ref = "HEAD", now = Date.now() } = {}) {
  serverName(name);
  if (ref === "HEAD") assertCommitted(name);
  const directory = path.join(ROOT, "servers", name);
  const source = sourceSnapshot(directory, { ref });
  const readEvidence = (file) => committedFile(ROOT, source.commit, file);
  let certificate;
  try { certificate = JSON.parse(readEvidence(receiptPath(name, source.tree))); } catch {}
  const report = await releaseVerdict({ directory, name, source, certificate, readEvidence, now });
  const own = (file) => JSON.parse(readEvidence(`servers/${name}/${file}`));
  let perf = null;
  try { perf = own("bench/perf.json"); } catch {}
  const results = execFileSync("git", ["ls-tree", "-r", "--name-only", source.commit, "--", `servers/${name}/bench/results`], { cwd: ROOT, encoding: "utf8" }).trim().split("\n").filter((file) => file.endsWith(".json"));
  report.observed = {
    certificate_present: Boolean(certificate), benchmark_result_files: results.length,
    performance_schema: perf?.schema ?? "legacy_or_missing",
    performance_source_matches: perf?.provenance?.source_sha256 === source.sha256,
  };
  return report;
}

export function assertFactoryReviewed(ref = "HEAD") {
  execFileSync("git", ["fetch", "origin", "main"], { cwd: ROOT, timeout: 30_000, stdio: ["ignore", "pipe", "pipe"] });
  const result = execFileSync("git", ["merge-base", "--is-ancestor", ref, "origin/main"], { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
  return result;
}

export async function assertReleaseReady(name, options) {
  const report = await checkRelease(name, options);
  if (!report.ready) throw new Error(`Release blocked for ${name}:\n${report.issues.map((issue) => `- ${issue}`).join("\n")}`);
  return report;
}

/** Prepares a certificate from real existing station artifacts, without inventing a success. */
export async function certify(name, { scout, quality, benchmark, ref = "HEAD", now = Date.now() }) {
  serverName(name);
  assertCommitted(name);
  const directory = path.join(ROOT, "servers", name);
  const source = sourceSnapshot(directory, { ref });
  const readEvidence = (file) => committedFile(ROOT, source.commit, file);
  const pkg = JSON.parse(readEvidence(`servers/${name}/package.json`));
  const paths = { scout, quality, benchmark, performance: `servers/${name}/bench/perf.json` };
  const evidence = {};
  for (const [kind, file] of Object.entries(paths)) evidence[kind] = { path: file, sha256: hash(readEvidence(file)) };
  const certificate = { schema: RELEASE_SCHEMA, created_at: new Date(now).toISOString(), factory_commit: source.commit, server: name, package: { name: pkg.name, version: pkg.version }, source_sha256: source.sha256, tree: source.tree, evidence };
  const verdict = await releaseVerdict({ directory, name, source, certificate, readEvidence, now });
  if (!verdict.ready) throw new Error(`Cannot certify ${name}: ${verdict.issues.join("; ")}`);
  const output = path.join(ROOT, receiptPath(name, source.tree));
  mkdirSync(path.dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(certificate, null, 2)}\n`, { flag: "wx" });
  return { path: path.relative(ROOT, output), ...verdict };
}

if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: { ref: { type: "string", default: "HEAD" }, certify: { type: "boolean", default: false }, scout: { type: "string" }, quality: { type: "string" }, benchmark: { type: "string" } } });
  try {
    const names = positionals.length ? positionals : listServerDirs().map((d) => path.basename(d));
    const reports = [];
    for (const name of names) reports.push(values.certify ? await certify(name, values) : await checkRelease(name, values));
    process.stdout.write(`${JSON.stringify({ ready: reports.filter((r) => r.ready).length, total: reports.length, reports }, null, 2)}\n`);
    if (reports.some((r) => !r.ready)) process.exitCode = 1;
  } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}
