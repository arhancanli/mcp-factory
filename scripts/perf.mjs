#!/usr/bin/env node
// node scripts/perf.mjs <name> [--runs 5] [--where "Dubai, home connection"]
//
// Measures what a server costs an agent, against the live upstream, and writes
// servers/<name>/bench/perf.json; npm run sync renders it into the README's Performance block.
//   - first call: a fresh server process answering one scenario (process start, TLS to the upstream,
//     the upstream's own time, our processing)
//   - repeat: the same call again in the same process (answered from cache: our overhead floor)
//   - result size: characters of the result an agent reads
//   - tool definitions: characters the client sends the model on every turn, ours and the best
//     competitor's (from bench/tasks.json)
// Scenarios are the server's own test/scenarios.mjs, the same calls the golden tests replay.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { connectMcp, assertConnectorUnchanged, MCP_CONNECTOR_SHA256 } from "../bench/mcp-client.mjs";
import { ROOT, readJson } from "./lib.mjs";
import { hash, identityHash, sourceSnapshot } from "../kit/release.mjs";

const RUNNER_SHA256 = hash(readFileSync(new URL(import.meta.url)));

// What a client sends the model for each tool: name, description and input schema (output schemas
// and annotations are for the client, not the model).
export const modelVisibleChars = (tools) => JSON.stringify(tools.map((t) => ({ name: t.name, description: t.description ?? "", input_schema: t.inputSchema }))).length;
export const listChars = (tools) => JSON.stringify(tools).length;

const connect = (command, args, cwd, timeoutMs = 15_000, env) => connectMcp({ command, args, cwd, timeoutMs, env });

const median = (xs) => {
  const ordered = [...xs].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
};

async function timed(fn) {
  const t = performance.now();
  const out = await fn();
  return { ms: performance.now() - t, out };
}

export function scenarioLabel(s) {
  if (s.label) return s.label;
  const brief = JSON.stringify(s.args).replace(/[{}"]/g, "").slice(0, 60);
  return `${s.tool} ${brief}`;
}

/** Actual cold start includes spawning and MCP initialization; failed repeats are not timings. */
export async function measureCall({ command, args = [], cwd, env }, scenario, { runs = 5, timeoutMs = 15_000 } = {}) {
  if (!Number.isSafeInteger(runs) || runs < 1 || runs > 20) throw new Error("Choose 1-20 repeat measurements.");
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 50 || timeoutMs > 120_000) throw new Error("Choose a 50-120000 ms request deadline.");
  const start = performance.now();
  const client = await connect(command, args, cwd, timeoutMs, env);
  try {
    const initialized = performance.now();
    const call = async () => {
      const out = await client.callTool({ name: scenario.tool, arguments: scenario.args }, undefined, { timeout: timeoutMs });
      if (out.isError) throw new Error(`${scenarioLabel(scenario)} returned a tool error; no performance result was recorded.`);
      return out;
    };
    const first = await timed(call);
    const coldStart = performance.now() - start;
    const repeats = [];
    for (let index = 0; index < runs; index++) repeats.push((await timed(call)).ms);
    return {
      call: scenarioLabel(scenario),
      first_call_ms: Number(coldStart.toFixed(3)),
      startup_initialize_ms: Number((initialized - start).toFixed(3)),
      first_request_ms: Number(first.ms.toFixed(3)),
      repeat_ms: Number(median(repeats).toFixed(3)),
      repeat_samples_ms: repeats,
      result_chars: (first.out.content ?? []).map((c) => c.text ?? "").join("").length,
      first_result: first.out,
    };
  } finally { await client.close(); }
}

export async function measure(name, { runs = 5, where = "Dubai, home connection" } = {}) {
  if (!Number.isSafeInteger(runs) || runs < 1 || runs > 20) throw new Error("Choose 1-20 repeat measurements.");
  if (typeof name !== "string" || !/^[a-z][a-z0-9-]{1,40}$/.test(name)) throw new Error("Choose a valid server name.");
  const dir = path.join(ROOT, "servers", name);
  const entry = path.join(dir, "src/server.mjs");
  const source = sourceSnapshot(dir);
  const { SCENARIOS } = await import(pathToFileURL(path.join(dir, "test/scenarios.mjs")).href);
  const scenarios = [];
  let example = null;
  // Scenarios marked expectError exist for the golden tests (for example, an invented identifier);
  // they are not typical calls, so they are not timed.
  for (const s of SCENARIOS.filter((x) => !x.expectError)) {
    const { first_result, ...measurement } = await measureCall({ command: process.execPath, args: [entry], cwd: dir }, s, { runs });
    if (!example && (s.example || SCENARIOS.every((x) => !x.example))) {
      example = { call: scenarioLabel(s), tool: s.tool, arguments: s.args, result: (first_result.content ?? []).map((c) => c.text ?? "").join("") };
    }
    scenarios.push(measurement);
  }
  const ours = await connect(process.execPath, [entry], dir);
  let oursTools;
  try { oursTools = (await ours.listTools(undefined, { timeout: 15_000 })).tools; }
  finally { await ours.close(); }
  let competitor = null;
  const tasksFile = path.join(dir, "bench/tasks.json");
  const spec = existsSync(tasksFile) ? readJson(tasksFile).competitor : null;
  if (spec) {
    const c = await connect(spec.command, spec.args ?? [], dir, 15_000, spec.env);
    try {
      const tools = (await c.listTools(undefined, { timeout: 15_000 })).tools;
      competitor = { label: spec.label, tool_definition_chars: modelVisibleChars(tools), tools_list_chars: listChars(tools) };
    } finally { await c.close(); }
  }
  if (sourceSnapshot(dir).sha256 !== source.sha256) throw new Error("Server source changed during performance measurement.");
  if (hash(readFileSync(new URL(import.meta.url))) !== RUNNER_SHA256) throw new Error("Performance runner changed during measurement.");
  assertConnectorUnchanged();
  return {
    schema: "canlilabs.performance.v2",
    timing_scope: "startup_initialize_first_call",
    measured_at: new Date().toISOString(),
    provenance: { source_sha256: source.sha256, competitor_sha256: identityHash(spec ?? null), runner_sha256: RUNNER_SHA256, connector_sha256: MCP_CONNECTOR_SHA256 },
    measured_on: new Date().toISOString().slice(0, 10),
    where,
    node: process.version,
    runs,
    tool_definition_chars: modelVisibleChars(oursTools),
    tools_list_chars: listChars(oursTools),
    competitor,
    scenarios,
    example,
  };
}

/** The README's Example block: a real call and the exact result the server returned when measured. */
export function renderExample(perf) {
  if (!perf?.example) return "Not yet recorded.";
  const e = perf.example;
  let pretty = e.result;
  try {
    pretty = JSON.stringify(JSON.parse(e.result), null, 2);
  } catch {}
  const lines = pretty.split("\n");
  const MAX = 60;
  const shown = lines.length > MAX ? [...lines.slice(0, MAX), `... (${lines.length - MAX} more lines)`] : lines;
  return [
    `An agent calls \`${e.tool}\` with:`,
    "",
    "```json",
    JSON.stringify(e.arguments, null, 2),
    "```",
    "",
    `and gets back (recorded from the live server on ${perf.measured_on}):`,
    "",
    "```json",
    ...shown,
    "```",
  ].join("\n");
}

/** The README's Performance block, from bench/perf.json. */
export function renderPerf(perf) {
  if (!perf) return "Not yet measured.";
  const includesStartup = perf.timing_scope === "startup_initialize_first_call";
  const lines = [
    `Measured ${perf.measured_on} from ${perf.where} against the live server, Node ${perf.node.replace(/^v/, "")} (\`bench/perf.json\`, \`scripts/perf.mjs\` in the factory).`,
    "",
    `| Call | ${includesStartup ? "First call including startup" : "First request after initialization"} | Repeat | Result size |`,
    "| --- | --- | --- | --- |",
    ...perf.scenarios.map((s) => `| ${s.call.replace(/\|/g, "\\|")} | ${s.first_call_ms} ms | ${s.repeat_ms} ms | ${s.result_chars.toLocaleString("en-US")} chars |`),
    "",
    includesStartup ? "First call includes the stdio process start, MCP initialization and first tool request. Startup and first-request timings are also recorded separately in perf.json. Repeated requests use the same process and include server work plus any upstream I/O or cache effects."
      : "This legacy record times the first tool request after MCP initialization; it excludes process startup. Repeated requests use the same process and include server work plus any upstream I/O or cache effects. Remeasure before comparing cold-start performance.",
    "",
    `Tool definitions the model reads on every turn (name, description, input schema): ${perf.tool_definition_chars.toLocaleString("en-US")} characters` +
      (perf.competitor ? `, against ${perf.competitor.tool_definition_chars.toLocaleString("en-US")} for ${perf.competitor.label}.` : ".") +
      (perf.tools_list_chars ? ` The full tool list, with the output schemas and annotations clients use to validate results, is ${perf.tools_list_chars.toLocaleString("en-US")} characters${perf.competitor?.tools_list_chars ? ` (${perf.competitor.tools_list_chars.toLocaleString("en-US")} for the alternative)` : ""}.` : ""),
  ];
  return lines.join("\n");
}

export function readPerf(dir) {
  const file = path.join(dir, "bench/perf.json");
  return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null;
}

if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: { runs: { type: "string", default: "5" }, where: { type: "string", default: "Dubai, home connection" } } });
  const name = positionals[0];
  const perf = await measure(name, { runs: Number(values.runs), where: values.where });
  const out = path.join(ROOT, "servers", name, "bench/perf.json");
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(perf, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(perf, null, 2)}\n`);
}
