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
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { ROOT, readJson } from "./lib.mjs";

// What a client sends the model for each tool: name, description and input schema (output schemas
// and annotations are for the client, not the model).
export const modelVisibleChars = (tools) => JSON.stringify(tools.map((t) => ({ name: t.name, description: t.description ?? "", input_schema: t.inputSchema }))).length;
export const listChars = (tools) => JSON.stringify(tools).length;

async function connect(command, args, cwd) {
  const client = new Client({ name: "factory-perf", version: "1" });
  await client.connect(new StdioClientTransport({ command, args, cwd, stderr: "ignore" }));
  return client;
}

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

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

export async function measure(name, { runs = 5, where = "Dubai, home connection" } = {}) {
  const dir = path.join(ROOT, "servers", name);
  const entry = path.join(dir, "src/server.mjs");
  const { SCENARIOS } = await import(pathToFileURL(path.join(dir, "test/scenarios.mjs")).href);
  const scenarios = [];
  let example = null;
  // Scenarios marked expectError exist for the golden tests (for example, an invented identifier);
  // they are not typical calls, so they are not timed.
  for (const s of SCENARIOS.filter((x) => !x.expectError)) {
    const client = await connect(process.execPath, [entry], dir);
    const first = await timed(() => client.callTool({ name: s.tool, arguments: s.args }));
    if (first.out.isError) throw new Error(`${scenarioLabel(s)} returned an error: ${first.out.content?.[0]?.text}`);
    const repeats = [];
    for (let i = 0; i < runs; i++) repeats.push((await timed(() => client.callTool({ name: s.tool, arguments: s.args }))).ms);
    await client.close();
    if (!example && (s.example || SCENARIOS.every((x) => !x.example))) {
      example = { call: scenarioLabel(s), tool: s.tool, arguments: s.args, result: (first.out.content ?? []).map((c) => c.text ?? "").join("") };
    }
    scenarios.push({
      call: scenarioLabel(s),
      first_call_ms: Math.round(first.ms),
      repeat_ms: Number(median(repeats).toFixed(1)),
      result_chars: (first.out.content ?? []).map((c) => c.text ?? "").join("").length,
    });
  }
  const ours = await connect(process.execPath, [entry], dir);
  const oursTools = (await ours.listTools()).tools;
  await ours.close();
  let competitor = null;
  const tasksFile = path.join(dir, "bench/tasks.json");
  const spec = existsSync(tasksFile) ? readJson(tasksFile).competitor : null;
  if (spec) {
    const c = await connect(spec.command, spec.args ?? [], dir);
    const tools = (await c.listTools()).tools;
    competitor = { label: spec.label, tool_definition_chars: modelVisibleChars(tools), tools_list_chars: listChars(tools) };
    await c.close();
  }
  return {
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
  const lines = [
    `Measured ${perf.measured_on} from ${perf.where} against the live upstream, Node ${perf.node.replace(/^v/, "")} (\`bench/perf.json\`, \`scripts/perf.mjs\` in the factory).`,
    "",
    "| Call | First call | Repeat | Result size |",
    "| --- | --- | --- | --- |",
    ...perf.scenarios.map((s) => `| ${s.call.replace(/\|/g, "\\|")} | ${s.first_call_ms} ms | ${s.repeat_ms} ms | ${s.result_chars.toLocaleString("en-US")} chars |`),
    "",
    "First call: a fresh server process, including the TLS connection and the upstream's own time. Repeat: the same call again, answered from the in-process cache, so it shows this server's own overhead.",
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
