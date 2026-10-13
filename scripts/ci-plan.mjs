#!/usr/bin/env node
// Select standalone package checks from complete Git trees, never a paginated API diff.
import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(fileURLToPath(import.meta.url), "../..");
export const MAX_SHARDS = 16;
export const TARGET_SHARD_SIZE = 64;
const NAME = /^[a-z][a-z0-9-]{1,40}$/;
const SHA = /^[a-f0-9]{40}$/;

function namesChecked(names) {
  if (!Array.isArray(names) || names.some((name) => typeof name !== "string" || !NAME.test(name)) || new Set(names).size !== names.length) {
    throw new Error("Server selection must contain distinct valid server names.");
  }
  return [...names].sort();
}

export function parseSelectedNames(raw, available) {
  const names = namesChecked(JSON.parse(raw));
  if (!names.length) throw new Error("An explicit package-check selection cannot be empty.");
  const allowed = new Set(namesChecked(available));
  if (names.some((name) => !allowed.has(name))) throw new Error("Selection names a server absent from this checkout.");
  return names;
}

/** Conservatively widen uncertain/global impact. Every selected server is checked once. */
export function planChecks({ names, changed = [], forceAll = false, reason = "explicit full check", base = null, head = null }) {
  const all = namesChecked(names);
  const available = new Set(all);
  const selected = new Set();
  const reasons = new Set(forceAll ? [reason] : []);
  let full = forceAll;
  const widen = (why) => { full = true; reasons.add(why); };
  if (!Array.isArray(changed)) throw new Error("Changed paths must be an array.");
  for (const file of changed) {
    if (typeof file !== "string" || !file || /[\0\r\n\\]/.test(file) || file.startsWith("/") || file.split("/").some((part) => part === "." || part === ".." || !part)) {
      widen("unrecognized path");
      continue;
    }
    const server = /^servers\/([^/]+)\/(.+)$/.exec(file);
    if (server) {
      const [, name, relative] = server;
      if (!available.has(name)) widen("removed or unrecognized server");
      else if (["package.json", "server.json"].includes(relative)) widen("collection metadata changed");
      else { selected.add(name); reasons.add("server files changed"); }
      continue;
    }
    const marketing = /^marketing\/(?:dist\/)?([a-z][a-z0-9-]{1,40})\.md$/.exec(file);
    if (marketing && available.has(marketing[1])) {
      selected.add(marketing[1]); reasons.add("server launch material changed"); continue;
    }
    if (/^(docs\/|lab\/)/.test(file) || file === "AGENTS.md") continue;
    // Kit, templates, workflows, scripts, root dependencies, catalog and any new
    // unknown path all affect the collection. The allowlist above is intentionally small.
    widen("shared or unrecognized files changed");
  }
  const servers = full ? all : [...selected].sort();
  const size = Math.max(TARGET_SHARD_SIZE, Math.ceil(servers.length / MAX_SHARDS));
  const shards = [];
  for (let start = 0; start < servers.length; start += size) {
    const part = servers.slice(start, start + size);
    shards.push({ id: shards.length + 1, count: part.length, names_json: JSON.stringify(part) });
  }
  return {
    schema: "canlilabs.ci-plan.v1", base, head,
    mode: full ? "all" : servers.length ? "selected" : "none",
    reasons: [...reasons].sort(), all_server_count: all.length,
    selected_server_count: servers.length, servers, shards,
    max_parallel: 4, max_shards: MAX_SHARDS, target_shard_size: TARGET_SHARD_SIZE,
  };
}

/** Git's no-renames NUL diff retains both old and new paths, including deletions. */
export function gitPlan({ directory = ROOT, base = null, head = "HEAD", forceAll = false } = {}) {
  const git = (...args) => execFileSync("git", args, { cwd: directory, encoding: "utf8", maxBuffer: 32 * 1024 * 1024, timeout: 30_000, stdio: ["ignore", "pipe", "pipe"] });
  if (!(head === "HEAD" || SHA.test(head))) throw new Error("Head must be HEAD or a full commit SHA.");
  const resolvedHead = git("rev-parse", "--verify", `${head}^{commit}`).trim();
  const files = git("ls-tree", "-r", "--name-only", "-z", resolvedHead, "--", "servers").split("\0").filter(Boolean);
  const names = namesChecked(files.flatMap((file) => {
    const match = /^servers\/([^/]+)\/package\.json$/.exec(file);
    return match ? [match[1]] : [];
  }));
  const available = new Set(names);
  if (files.some((file) => {
    const match = /^servers\/([^/]+)\//.exec(file);
    return match && !available.has(match[1]);
  })) throw new Error("A server directory has no committed package.json.");
  const full = (reason) => planChecks({ names, forceAll: true, reason, base, head: resolvedHead });
  if (forceAll) return full("main, scheduled, manual or explicit full check");
  if (!base || !SHA.test(base)) return full("missing or invalid base; full check required");
  try {
    git("rev-parse", "--verify", `${base}^{commit}`);
    const changed = git("diff", "--no-renames", "--name-only", "-z", base, resolvedHead, "--").split("\0").filter(Boolean);
    return planChecks({ names, changed, base, head: resolvedHead });
  } catch {
    return full("base or complete diff unavailable; full check required");
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  let base = process.env.CANLILABS_CI_BASE ?? null;
  let head = process.env.CANLILABS_CI_HEAD ?? "HEAD";
  let forceAll = process.env.GITHUB_EVENT_NAME !== "pull_request";
  let explicitAll = false;
  for (let index = 0; index < args.length; index++) {
    if (args[index] === "--all") explicitAll = true;
    else if (args[index] === "--base" && args[index + 1]) { base = args[++index]; forceAll = false; }
    else if (args[index] === "--head" && args[index + 1]) head = args[++index];
    else throw new Error("Usage: ci-plan.mjs [--base <full-sha>] [--head <full-sha>] [--all]");
  }
  const plan = gitPlan({ base, head, forceAll: forceAll || explicitAll });
  process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
  if (process.env.GITHUB_OUTPUT) {
    // Keys are fixed and every dynamic value is a single JSON line or an integer.
    const matrix = { include: plan.shards.length ? plan.shards : [{ id: 0, count: 0, names_json: "[]" }] };
    appendFileSync(process.env.GITHUB_OUTPUT, `count=${plan.selected_server_count}\nmode=${plan.mode}\nmatrix=${JSON.stringify(matrix)}\n`);
  }
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY,
    `Standalone selection: ${plan.selected_server_count}/${plan.all_server_count} packages; ${plan.shards.length} shards, at most ${plan.max_parallel} in parallel.\n\nMode: ${plan.mode}. Reasons: ${plan.reasons.join("; ") || "documentation or laboratory only"}.\n`);
}
