#!/usr/bin/env node
// node bench/run.mjs servers/<name> [--model claude-opus-4-8] [--arm ours|competitor|both] [--dry]
//
// Station 4 of the factory. Runs the server's fixed task set (servers/<name>/bench/tasks.json)
// through a real agent loop, once with our server's tools and once with the best competitor's,
// same model, same prompt, arms run one after the other (never in parallel, so rate limits do not
// bias one arm). Answers are graded by fixed checks in the task file, never by a model. Records
// per task: correct, tool calls, input/output/cached tokens, wall time. Writes
// bench/results/<date>-<model>.json in the server and the README bench block.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import Anthropic from "@anthropic-ai/sdk";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { readJson, replaceBlock } from "../scripts/lib.mjs";

const SYSTEM = "Answer the user's question using the tools available. Finish with one line that starts with 'ANSWER:' followed by the answer only.";
const MAX_TURNS = 8;

/** Deterministic grading of the final answer line. Exported for tests. */
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
  throw new Error(`task has no recognised expect rule: ${JSON.stringify(expect)}`);
}

/** MCP tool list to Anthropic tool definitions, byte-stable in the server's order. */
export const toAnthropicTools = (tools) => tools.map((t) => ({ name: t.name, description: t.description ?? "", input_schema: t.inputSchema }));

async function connect(spec, cwd) {
  const transport = new StdioClientTransport({ command: spec.command, args: spec.args ?? [], env: { ...process.env, ...(spec.env ?? {}) }, cwd, stderr: "ignore" });
  const client = new Client({ name: "factory-bench", version: "1" });
  await client.connect(transport);
  return client;
}

async function runTask(anthropic, model, mcp, tools, task) {
  const messages = [{ role: "user", content: task.prompt }];
  const usage = { input: 0, output: 0, cache_read: 0, cache_write: 0 };
  let toolCalls = 0;
  let finalText = "";
  const started = performance.now();
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const res = await anthropic.messages.create({ model, max_tokens: 4000, system: SYSTEM, tools, messages });
    usage.input += res.usage.input_tokens;
    usage.output += res.usage.output_tokens;
    usage.cache_read += res.usage.cache_read_input_tokens ?? 0;
    usage.cache_write += res.usage.cache_creation_input_tokens ?? 0;
    finalText = res.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
    if (res.stop_reason !== "tool_use") break;
    messages.push({ role: "assistant", content: res.content });
    const results = [];
    for (const block of res.content.filter((b) => b.type === "tool_use")) {
      toolCalls++;
      let content;
      let isError = false;
      try {
        const out = await mcp.callTool({ name: block.name, arguments: block.input });
        content = (out.content ?? []).filter((c) => c.type === "text").map((c) => c.text).join("\n") || JSON.stringify(out.structuredContent ?? {});
        isError = Boolean(out.isError);
      } catch (err) {
        content = `Tool call failed: ${err.message}`;
        isError = true;
      }
      results.push({ type: "tool_result", tool_use_id: block.id, content, ...(isError ? { is_error: true } : {}) });
    }
    messages.push({ role: "user", content: results });
  }
  return { id: task.id, correct: grade(task.expect, finalText), tool_calls: toolCalls, ...usage, ms: Math.round(performance.now() - started) };
}

export function summarize(rows) {
  const sum = (k) => rows.reduce((a, r) => a + r[k], 0);
  const input = sum("input") + sum("cache_read") + sum("cache_write");
  return {
    tasks: rows.length,
    correct: rows.filter((r) => r.correct).length,
    tokens_in: input,
    tokens_out: sum("output"),
    cached_share: input ? Number((sum("cache_read") / input).toFixed(3)) : 0,
    tool_calls: sum("tool_calls"),
    median_ms: rows.length ? [...rows].map((r) => r.ms).sort((a, b) => a - b)[Math.floor(rows.length / 2)] : 0,
  };
}

export function renderBench(result) {
  const lines = [`Measured ${result.date} with ${result.model}, ${result.summary.ours.tasks} fixed tasks graded by fixed checks (\`bench/tasks.json\`, raw results in \`bench/results/\`).`, "", "| Server | Correct | Input tokens | Output tokens | Tool calls | Median time |", "| --- | --- | --- | --- | --- | --- |"];
  for (const [arm, s] of Object.entries(result.summary)) {
    const label = arm === "ours" ? "This server" : result.competitor_label;
    lines.push(`| ${label} | ${s.correct}/${s.tasks} | ${s.tokens_in} | ${s.tokens_out} | ${s.tool_calls} | ${(s.median_ms / 1000).toFixed(1)} s |`);
  }
  return lines.join("\n");
}

if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: { model: { type: "string", default: "claude-opus-4-8" }, arm: { type: "string", default: "both" }, dry: { type: "boolean", default: false } } });
  const dir = path.resolve(positionals[0] ?? "");
  const spec = readJson(path.join(dir, "bench/tasks.json"));
  const arms = { ours: { command: process.execPath, args: [path.join(dir, "src/server.mjs")] } };
  if (spec.competitor && values.arm !== "ours") arms.competitor = spec.competitor;
  if (values.arm === "competitor") delete arms.ours;

  const anthropic = new Anthropic();
  const result = { date: new Date().toISOString().slice(0, 10), model: values.model, competitor_label: spec.competitor?.label ?? "", rows: {}, summary: {} };
  for (const [arm, armSpec] of Object.entries(arms)) {
    const mcp = await connect(armSpec, dir);
    const { tools } = await mcp.listTools();
    const anthropicTools = toAnthropicTools(tools);
    process.stderr.write(`${arm}: ${tools.length} tools, ${JSON.stringify(anthropicTools).length} chars\n`);
    if (values.dry) {
      await mcp.close();
      continue;
    }
    result.rows[arm] = [];
    for (const task of spec.tasks) {
      const row = await runTask(anthropic, values.model, mcp, anthropicTools, task);
      result.rows[arm].push(row);
      process.stderr.write(`  ${arm} ${task.id}: ${row.correct ? "correct" : "WRONG"} ${row.input + row.cache_read}+${row.output} tok ${row.ms} ms\n`);
    }
    result.summary[arm] = summarize(result.rows[arm]);
    await mcp.close();
  }
  if (!values.dry) {
    mkdirSync(path.join(dir, "bench/results"), { recursive: true });
    writeFileSync(path.join(dir, `bench/results/${result.date}-${values.model}.json`), `${JSON.stringify(result, null, 2)}\n`);
    if (result.summary.ours) {
      const readme = path.join(dir, "README.md");
      writeFileSync(readme, replaceBlock(readFileSync(readme, "utf8"), "bench", renderBench(result)));
    }
    process.stdout.write(`${JSON.stringify(result.summary, null, 2)}\n`);
  }
}
