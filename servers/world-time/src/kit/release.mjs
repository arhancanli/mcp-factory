// Release evidence is tied to executable/configuration files, then the final committed tree.
// README and measured reports are derived outputs, so measuring them does not change its input.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { constants, openSync, fstatSync, closeSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";

export const RELEASE_SCHEMA = "canlilabs.release.v1";
export const MAX_EVIDENCE_BYTES = 8 * 1024 * 1024;
export const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const ordered = (value) => Array.isArray(value) ? value.map(ordered) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, ordered(value[key])])) : value;
export const identityHash = (value) => hash(JSON.stringify(ordered(value)));
const git = (directory, args, encoding = "utf8") => execFileSync("git", args, {
  cwd: directory, encoding, timeout: 10_000, maxBuffer: 64 * 1024 * 1024,
});
const derived = (file) => file === "README.md" || file === "bench/perf.json" || file.startsWith("bench/results/");
const validPath = (file) => typeof file === "string" && file.length <= 512 && !file.startsWith("/") &&
  !file.includes("\\") && !file.split("/").some((p) => !p || p === "." || p === "..");

export function committedFile(root, ref, file) {
  if (!validPath(file)) throw new Error("Evidence paths must be bounded repository-relative paths.");
  const entry = git(root, ["ls-tree", "-z", ref, "--", file]).trim();
  if (!/^100(?:644|755) blob [a-f0-9]{40}\t/.test(entry)) throw new Error(`Missing regular committed file: ${file}`);
  const bytes = git(root, ["show", `${ref}:${file}`], null);
  if (bytes.length > MAX_EVIDENCE_BYTES) throw new Error(`Evidence exceeds 8 MiB: ${file}`);
  return bytes;
}

export function sourceSnapshot(directory, { ref } = {}) {
  directory = realpathSync(directory);
  const root = git(directory, ["rev-parse", "--show-toplevel"]).trim();
  const prefix = path.relative(root, directory).split(path.sep).join("/");
  const commit = git(root, ["rev-parse", "--verify", `${ref ?? "HEAD"}^{commit}`]).trim();
  const tree = git(root, ["rev-parse", prefix ? `${commit}:${prefix}` : `${commit}^{tree}`]).trim();
  const entries = git(root, ["ls-tree", "-r", "-z", tree]).split("\0").filter(Boolean);
  const committed = new Map(entries.map((entry) => {
    const [header, file] = entry.split("\t");
    const [mode, type] = header.split(" ");
    return [file, { mode, type }];
  }));
  const files = ref ? [...committed.keys()] : [...new Set(git(directory,
    ["ls-files", "-co", "--exclude-standard", "-z", "--", "."]).split("\0").filter(Boolean))];
  const records = [];
  for (const file of files.sort().filter((file) => !derived(file))) {
    if (!validPath(file)) throw new Error("Source contains an unsupported path.");
    const mode = committed.get(file)?.mode ?? "100644";
    let bytes;
    if (ref) {
      if (committed.get(file)?.type !== "blob" || !["100644", "100755"].includes(mode)) throw new Error("Source contains a link or submodule.");
      bytes = committedFile(root, commit, prefix ? `${prefix}/${file}` : file);
    } else {
      const location = path.join(directory, file);
      // Open once, refuse symlinks and check/read the same descriptor rather than a raced path.
      const descriptor = openSync(location, constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        const stat = fstatSync(descriptor);
        if (!stat.isFile() || stat.size > MAX_EVIDENCE_BYTES) throw new Error(`Unsupported source file: ${file}`);
        bytes = readFileSync(descriptor);
      } finally { closeSync(descriptor); }
    }
    records.push({ path: file, mode, sha256: hash(bytes) });
  }
  return { schema: "canlilabs.source.v1", sha256: hash(JSON.stringify(records)), files: records, commit, tree };
}

export function grade(expect, finalText) {
  const line = (finalText.match(/ANSWER:\s*(.*)$/im)?.[1] ?? "").trim();
  if (!line) return false;
  const lower = line.toLowerCase();
  if (expect.contains) return expect.contains.every((s) => lower.includes(String(s).toLowerCase()));
  if (expect.any) return expect.any.some((s) => lower.includes(String(s).toLowerCase()));
  if (expect.regex) return new RegExp(expect.regex, "i").test(line);
  if (expect.number !== undefined) {
    const n = Number(line.replace(/[, ]/g, "").match(/-?\d+(\.\d+)?(e-?\d+)?/i)?.[0]);
    return Number.isFinite(n) && Math.abs(n - expect.number) <= (expect.tol ?? 0);
  }
  throw new Error("task has no recognised expect rule");
}

export function summarize(rows) {
  const sum = (key) => rows.reduce((total, row) => total + row[key], 0);
  const input = sum("input") + sum("cache_read") + sum("cache_write");
  return {
    tasks: rows.length, correct: rows.filter((r) => r.correct).length,
    tokens_in: input, tokens_out: sum("output"),
    cached_share: input ? Number((sum("cache_read") / input).toFixed(3)) : 0,
    tool_calls: sum("tool_calls"),
    median_ms: rows.length ? [...rows].map((r) => r.ms).sort((a, b) => a - b)[Math.floor(rows.length / 2)] : 0,
  };
}

const finite = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0;
const count = (value) => Number.isSafeInteger(value) && value >= 0;
export function fresh(timestamp, days, now = Date.now()) {
  const parsed = Date.parse(timestamp);
  return Number.isFinite(parsed) && parsed <= now + 300_000 && now - parsed <= days * 86_400_000;
}

/** A label is not a pinned execution identity. The command must name the recorded version/ref. */
export function pinnedCompetitor(spec) {
  const identity = spec?.identity;
  if (!identity || !spec.command || !Array.isArray(spec.args)) return false;
  if (identity.kind === "pypi") return spec.command === "uvx" && /^[a-z0-9][a-z0-9._-]*$/i.test(identity.name ?? "") &&
    /^\d+\.\d+(?:\.\d+)?(?:[a-z0-9.+-]*)$/i.test(identity.version ?? "") && spec.args.includes(`${identity.name}==${identity.version}`);
  if (identity.kind === "npm") return spec.command === "npx" && /^[a-z0-9@/._-]+$/i.test(identity.name ?? "") &&
    /^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/i.test(identity.version ?? "") && spec.args.includes(`${identity.name}@${identity.version}`);
  if (identity.kind === "git") return /^[a-f0-9]{40}$/.test(identity.commit ?? "") &&
    /^https:\/\/github\.com\/[a-z0-9_.-]+\/[a-z0-9_.-]+$/i.test(identity.repository ?? "") &&
    spec.args.some((arg) => typeof arg === "string" && arg.includes(identity.commit));
  return false;
}

export function benchmarkVerdict(result, spec, source, { now = Date.now() } = {}) {
  const issues = [];
  const tasks = spec?.tasks ?? [];
  const ids = tasks.map((t) => t.id);
  if (tasks.length < 10 || tasks.length > 100 || new Set(ids).size !== ids.length) issues.push("benchmark needs 10-100 distinct fixed tasks");
  if (!pinnedCompetitor(spec?.competitor)) issues.push("incumbent command must pin an explicit version or commit");
  const provenance = result?.provenance;
  if (result?.schema !== "canlilabs.benchmark.v2" || provenance?.source_sha256 !== source.sha256) issues.push("benchmark is missing current source provenance");
  if (provenance?.tasks_sha256 !== identityHash(spec)) issues.push("benchmark task corpus differs");
  if (provenance?.competitor_sha256 !== identityHash(spec?.competitor ?? null)) issues.push("benchmark incumbent differs");
  if (!fresh(result?.measured_at, 30, now)) issues.push("benchmark must be measured within 30 days");
  if (!result?.model || !result?.provider || !/^[a-f0-9]{64}$/.test(provenance?.runner_sha256 ?? "")) issues.push("benchmark must identify model, provider and runner");
  const summaries = {};
  const resolved = new Set();
  for (const arm of ["ours", "competitor"]) {
    const rows = result?.rows?.[arm];
    if (!Array.isArray(rows) || rows.length !== tasks.length || rows.some((row, i) => row.id !== ids[i])) {
      issues.push(`${arm} benchmark must cover the identical task corpus in order`);
      continue;
    }
    let valid = true;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!["input", "output", "cache_read", "cache_write", "tool_calls"].every((key) => count(row[key])) ||
          !finite(row.ms) || row.input + row.cache_read + row.cache_write < 1 || row.error) valid = false;
      if (typeof row.final_text !== "string" || row.final_text.length > 64_000 || typeof row.correct !== "boolean") valid = false;
      else if (row.correct !== grade(tasks[i].expect, row.final_text)) valid = false;
      if (!row.resolved_model) valid = false;
      else resolved.add(row.resolved_model);
    }
    if (!valid) issues.push(`${arm} rows need raw graded answers, valid usage and no API failures`);
    else summaries[arm] = summarize(rows);
  }
  if (resolved.size !== 1) issues.push("both arms must use the same resolved model");
  let winner = false;
  if (summaries.ours && summaries.competitor) {
    const noRegression = summaries.ours.correct >= summaries.competitor.correct;
    const fewerTokens = summaries.ours.tokens_in + summaries.ours.tokens_out < summaries.competitor.tokens_in + summaries.competitor.tokens_out;
    const additional = tasks.some((task, index) => task.competitor_unsupported?.source?.startsWith("https://") &&
      task.competitor_unsupported?.reason?.length >= 20 && result.rows.ours[index].correct && !result.rows.competitor[index].correct);
    winner = noRegression && (fewerTokens || additional);
    if (summaries.ours.correct / Math.max(1, tasks.length) < 0.9) {
      winner = false;
      issues.push("release benchmark needs at least 90% fixed-task accuracy");
    }
    if (!winner) issues.push("accuracy must not regress, with fewer total tokens or documented additional coverage");
  }
  return { passed: issues.length === 0 && winner, issues, summaries };
}

export function performanceIssues(perf, spec, source, now = Date.now()) {
  const issues = [];
  if (perf?.schema !== "canlilabs.performance.v2" || perf?.provenance?.source_sha256 !== source.sha256) issues.push("performance measurement lacks current source provenance");
  if (perf?.provenance?.competitor_sha256 !== identityHash(spec?.competitor ?? null)) issues.push("performance incumbent differs");
  if (!fresh(perf?.measured_at, 7, now)) issues.push("live performance measurement must be within seven days");
  if (!count(perf?.tool_definition_chars) || !count(perf?.tools_list_chars) || !Array.isArray(perf?.scenarios) || !perf.scenarios.length ||
      perf.scenarios.some((s) => !finite(s.first_call_ms) || !finite(s.repeat_ms) || !count(s.result_chars))) issues.push("performance needs valid live scenarios and tool sizes");
  return issues;
}

/** No failed HTTP request, invalid body, missing version, or permission error proves absence. */
export async function registryVersion(name, version, { execute = execFileSync } = {}) {
  if (typeof name !== "string" || !/^(?:@[a-z0-9][a-z0-9._-]{0,100}\/)?[a-z0-9][a-z0-9._-]{0,100}$/.test(name) ||
      typeof version !== "string" || !/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(version) || version.length > 80) return { state: "unknown", reason: "invalid_public_package_identity" };
  try {
    // npm's public metadata protocol owns the request; no arbitrary file content is an HTTP URL.
    const stdout = execute("npm", ["view", `${name}@${version}`, "--json", "--registry=https://registry.npmjs.org", "--fetch-retries=0", "--fetch-timeout=10000"], {
      encoding: "utf8", timeout: 15_000, maxBuffer: 2 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"],
    });
    const record = JSON.parse(stdout);
    if (record.name !== name || record.version !== version || typeof record.dist?.integrity !== "string") return { state: "unknown", reason: "invalid_version_metadata" };
    return { state: "published", integrity: record.dist.integrity, tarball: record.dist.tarball };
  } catch (error) {
    try {
      const diagnostic = JSON.parse(String(error.stdout ?? ""));
      if (diagnostic.error?.code === "E404") return { state: "missing", status: 404 };
    } catch {}
    return { state: "unknown", reason: "registry_request_failed" };
  }
}

export function assertRegistryKnown(result) {
  if (!["published", "missing"].includes(result.state)) throw new Error("npm version state is unknown; publication is blocked. Retry the read-only lookup.");
  return result;
}

export function scoutIssues(scout, spec, name, now = Date.now()) {
  const issues = [];
  if (scout?.schema !== "canlilabs.scout.v1" || scout.server !== name || !fresh(scout.reviewed_at, 30, now)) issues.push("scout review must identify this niche and be within 30 days");
  if (!Array.isArray(scout?.demand) || !scout.demand.length || scout.demand.some((e) => !e.url?.startsWith("https://") || !e.signal || !fresh(e.observed_at, 30, now))) issues.push("scout needs dated demand sources");
  if (!scout?.source?.url?.startsWith("https://") || !scout.source.license || !scout.source.cost || !scout.source.rate_limits) issues.push("scout needs source, licence, cost and rate-limit facts");
  if (identityHash(scout?.incumbent?.identity ?? null) !== identityHash(spec?.competitor?.identity ?? null) || !scout?.incumbent?.selection_reason || scout.incumbent.selection_reason.length < 20 || !scout.incumbent.url?.startsWith("https://")) issues.push("scout must justify and identify the measured strongest incumbent");
  return issues;
}

export function qualityIssues(quality, source, now = Date.now()) {
  const issues = [];
  if (quality?.schema !== "canlilabs.quality.v1" || quality.source_sha256 !== source.sha256 || quality.tree !== source.tree || !fresh(quality.measured_at, 7, now)) issues.push("quality receipt must bind current source/tree and be within seven days");
  for (const station of ["factory", "standalone", "canary", "audit"]) {
    const record = quality?.checks?.[station];
    if (record?.exit_code !== 0 || !validPath(record?.log?.path) || !/^[a-f0-9]{64}$/.test(record?.log?.sha256 ?? "")) issues.push(`${station} requires a successful bounded execution log`);
  }
  if (!count(quality?.checks?.factory?.tests) || quality.checks.factory.tests < 1 || !count(quality?.checks?.standalone?.tests) || quality.checks.standalone.tests < 1) issues.push("quality checks must execute actual tests");
  if (quality?.checks?.standalone?.tree !== source.tree || quality?.checks?.standalone?.initialize !== true || quality?.checks?.standalone?.tools_list !== true || !/^sha512-[A-Za-z0-9+/]+=*$/.test(quality?.checks?.standalone?.packed_integrity ?? "")) issues.push("the exact packed tree must initialize and list tools, with a tarball digest");
  return issues;
}

/** All reads are anchored to one immutable factory commit, with no working-tree evidence. */
export async function releaseVerdict({ directory, name, source, certificate, readEvidence, readPackage, now = Date.now() }) {
  directory = realpathSync(directory);
  if (!readPackage) {
    const root = git(directory, ["rev-parse", "--show-toplevel"]).trim();
    const prefix = path.relative(root, directory).split(path.sep).join("/");
    readPackage = (file) => committedFile(root, source.commit, prefix ? `${prefix}/${file}` : file);
  }
  const pkg = JSON.parse(await readPackage("package.json"));
  const issues = [];
  if (certificate?.schema !== RELEASE_SCHEMA || certificate.server !== name || certificate.package?.name !== pkg.name || certificate.package?.version !== pkg.version || certificate.source_sha256 !== source.sha256 || certificate.tree !== source.tree) issues.push("release certificate must bind package, version, source and final Git tree");
  if (!fresh(certificate?.created_at, 7, now)) issues.push("release certificate must be within seven days");
  const documents = {};
  for (const kind of ["scout", "quality", "benchmark", "performance"]) {
    const reference = certificate?.evidence?.[kind];
    if (!validPath(reference?.path) || !/^[a-f0-9]{64}$/.test(reference?.sha256 ?? "")) {
      issues.push(`${kind} evidence is missing`);
      continue;
    }
    try {
      const bytes = await readEvidence(reference.path);
      if (bytes.length > MAX_EVIDENCE_BYTES || hash(bytes) !== reference.sha256) throw new Error("Evidence digest differs.");
      documents[kind] = JSON.parse(bytes);
    } catch { issues.push(`${kind} committed evidence failed its hash or JSON check`); }
  }
  const spec = JSON.parse(await readPackage("bench/tasks.json"));
  issues.push(...scoutIssues(documents.scout, spec, name, now));
  issues.push(...qualityIssues(documents.quality, source, now));
  const benchmark = benchmarkVerdict(documents.benchmark, spec, source, { now });
  issues.push(...benchmark.issues);
  issues.push(...performanceIssues(documents.performance, spec, source, now));
  for (const [kind, check] of Object.entries(documents.quality?.checks ?? {})) {
    try {
      const bytes = await readEvidence(check.log.path);
      if (hash(bytes) !== check.log.sha256) throw new Error("Changed execution log.");
      const text = bytes.toString("utf8");
      if (["factory", "standalone"].includes(kind)) {
        const passed = Number(text.match(/^(?:# |\u2139 )pass (\d+)$/m)?.[1] ?? 0);
        const total = Number(text.match(/^(?:# |\u2139 )tests (\d+)$/m)?.[1] ?? 0);
        if (!passed || total !== passed || passed !== check.tests || !/^(?:# |\u2139 )fail 0$/m.test(text)) throw new Error("No complete passing test proof.");
      }
      if (kind === "audit") {
        const audit = JSON.parse(text);
        if (audit.metadata?.vulnerabilities?.high !== 0 || audit.metadata?.vulnerabilities?.critical !== 0) throw new Error("Audit does not prove the high/critical gate.");
      }
    } catch { issues.push(`${kind} execution log is missing, changed or does not prove the check`); }
  }
  return { schema: "canlilabs.release-readiness.v1", server: name, package: pkg.name, version: pkg.version, source_sha256: source.sha256, tree: source.tree, ready: issues.length === 0 && benchmark.passed, issues: [...new Set(issues)], benchmark: benchmark.summaries, packed_integrity: documents.quality?.checks?.standalone?.packed_integrity ?? null };
}
