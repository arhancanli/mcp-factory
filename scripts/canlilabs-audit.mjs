#!/usr/bin/env node
// Local evidence is separate from current public release evidence. Read-only online
// checks are opt-in and never turn a catalog entry into an assumed release.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const exec = promisify(execFile);
const read = (p) => JSON.parse(readFileSync(p, "utf8"));
const relative = (p) => path.relative(ROOT, p);

export function localEvidence(root = ROOT) {
  const catalog = read(path.join(root, "catalog.json"));
  return catalog.servers.map((server) => {
    const dir = path.join(root, "servers", server.name.replace(/-mcp$/, ""));
    const resultDir = path.join(dir, "bench/results");
    const resultFiles = existsSync(resultDir) ? readdirSync(resultDir).filter((f) => f.endsWith(".json")).sort() : [];
    const benchmarks = resultFiles.map((f) => {
      const p = path.join(resultDir, f);
      const result = read(p);
      const ours = result.summary?.ours;
      const other = result.summary?.competitor;
      const comparable = Boolean(ours?.tasks > 0 && other?.tasks === ours.tasks);
      const accuracyAtLeastEqual = comparable && ours.correct >= other.correct;
      const oursTokens = (ours?.tokens_in ?? 0) + (ours?.tokens_out ?? 0);
      const otherTokens = (other?.tokens_in ?? 0) + (other?.tokens_out ?? 0);
      return {
        path: path.relative(root, p), date: result.date, model: result.model,
        competitor: result.competitor_label, ours: ours ?? null, competitor_summary: other ?? null,
        comparable, accuracy_at_least_equal: accuracyAtLeastEqual,
        lower_total_tokens: comparable && oursTokens < otherTokens,
        // Additional useful task coverage needs an explicit review, not inferred superiority.
        basic_shipping_rule_met: accuracyAtLeastEqual && oursTokens < otherTokens,
      };
    });
    const perfFile = path.join(dir, "bench/perf.json");
    const perf = existsSync(perfFile) ? read(perfFile) : null;
    return {
      name: server.name, version: server.version, category: server.category,
      tools: server.tools.length, repository: server.repository, mcp_name: server.mcpName,
      golden_test_files: readdirSync(path.join(dir, "test")).filter((f) => f.endsWith(".test.mjs")),
      canary_implemented: existsSync(path.join(dir, "test/live.canary.mjs")),
      performance: perf ? { path: path.relative(root, perfFile), date: perf.measured_on, scenarios: perf.scenarios.length, tools_list_chars: perf.tools_list_chars } : null,
      benchmarks, agent_benchmark_present: benchmarks.length > 0,
    };
  });
}

async function jsonRequest(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(15000), redirect: "error", headers: { Accept: "application/json" } });
    if (!response.ok) return { status: response.status === 404 ? "missing" : "error", http_status: response.status, url };
    return { status: "found", data: await response.json(), url };
  } catch (error) {
    return { status: "error", error: error.name, url };
  }
}

async function github(endpoint) {
  try {
    const { stdout } = await exec("gh", ["api", endpoint], { timeout: 20000, maxBuffer: 2 * 1024 * 1024 });
    return { status: "found", data: JSON.parse(stdout), url: `https://api.github.com/${endpoint}` };
  } catch (error) {
    return { status: /HTTP 404/.test(error.stderr ?? "") ? "missing" : "error", error: "github_query_failed", url: `https://api.github.com/${endpoint}` };
  }
}

async function releaseEvidence(server) {
  const repo = server.repository.replace("https://github.com/", "");
  const [npm, repository, release, canary, registry] = await Promise.all([
    jsonRequest(`https://registry.npmjs.org/${encodeURIComponent(server.name)}/${encodeURIComponent(server.version)}`),
    github(`repos/${repo}`),
    github(`repos/${repo}/releases/tags/v${server.version}`),
    github(`repos/${repo}/actions/workflows/canary.yml/runs?per_page=1`),
    jsonRequest(`https://registry.modelcontextprotocol.io/v0.1/servers?search=${encodeURIComponent(server.mcp_name)}&limit=100`),
  ]);
  const records = registry.data?.servers ?? [];
  const entry = records.find((item) => {
    const value = item.server ?? item;
    return value.name === server.mcp_name && value.version === server.version;
  });
  const lastCanary = canary.data?.workflow_runs?.[0];
  return {
    checked_at: new Date().toISOString(),
    npm: { status: npm.status, source: npm.url, http_status: npm.http_status ?? null, error: npm.error ?? null, version: npm.data?.version ?? null, integrity: npm.data?.dist?.integrity ?? null, attestations: npm.data?.dist?.attestations ?? null },
    repository: { status: repository.status, source: repository.url, url: repository.data?.html_url ?? null, stars: repository.data?.stargazers_count ?? null, open_issues: repository.data?.open_issues_count ?? null, pushed_at: repository.data?.pushed_at ?? null },
    release: { status: release.status, source: release.url, url: release.data?.html_url ?? null, published_at: release.data?.published_at ?? null, assets: release.data?.assets?.map((a) => ({ name: a.name, url: a.browser_download_url })) ?? [] },
    canary: { status: canary.status, source: canary.url, last_run: lastCanary ? { url: lastCanary.html_url, conclusion: lastCanary.conclusion, status: lastCanary.status, started_at: lastCanary.run_started_at } : null },
    registry: { status: registry.status === "found" ? (entry ? "found" : "not_found_in_search") : registry.status, source: registry.url, http_status: registry.http_status ?? null, error: registry.error ?? null, entry: entry ?? null, search_may_be_paginated: Boolean(registry.data?.metadata?.nextCursor) },
    // Exact repository tree parity and attestation verification are separate gates.
    source_parity_verified: false, signatures_verified: false,
  };
}

export async function audit({ online = false } = {}) {
  const servers = localEvidence();
  if (online) {
    let next = 0;
    await Promise.all(Array.from({ length: 3 }, async () => {
      while (next < servers.length) {
        const server = servers[next++];
        server.public_release = await releaseEvidence(server);
        process.stderr.write(`Checked ${server.name}\n`);
      }
    }));
  }
  return {
    schema: "canlilabs.audit.v1", generated_at: new Date().toISOString(),
    source_commit: (await exec("git", ["rev-parse", "HEAD"], { cwd: ROOT })).stdout.trim(),
    online_checks: online, summary: {
      catalog_entries: servers.length,
      agent_benchmarks_present: servers.filter((s) => s.agent_benchmark_present).length,
      missing_agent_benchmarks: servers.filter((s) => !s.agent_benchmark_present).map((s) => s.name),
      performance_files: servers.filter((s) => s.performance).length,
      npm_versions_found: online ? servers.filter((s) => s.public_release.npm.status === "found").length : null,
      registry_versions_found: online ? servers.filter((s) => s.public_release.registry.status === "found").length : null,
      last_canary_success: online ? servers.filter((s) => s.public_release.canary.last_run?.conclusion === "success").length : null,
      all_quality_gates_verified: false,
    }, servers,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: { online: { type: "boolean", default: false }, out: { type: "string" } } });
  const result = await audit({ online: values.online });
  if (values.out) {
    const destination = path.resolve(values.out);
    mkdirSync(path.dirname(destination), { recursive: true });
    writeFileSync(destination, `${JSON.stringify(result, null, 2)}\n`, { flag: "wx" });
    process.stdout.write(`Saved ${relative(destination)}\n`);
  }
  process.stdout.write(`${JSON.stringify(result.summary, null, 2)}\n`);
}
