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
import { grade, hash, identityHash, sourceSnapshot, summarize } from "../kit/release.mjs";

export { grade, summarize } from "../kit/release.mjs";

const SYSTEM = "Answer the user's question using the tools available. Finish with one line that starts with 'ANSWER:' followed by the answer only.";
const MAX_TURNS = 8;

/** Deterministic grading of the final answer line. Exported for tests. */
/** MCP tool list to Anthropic tool definitions, byte-stable in the server's order. */
export const toAnthropicTools = (tools) => tools.map((t) => ({ name: t.name, description: t.description ?? "", input_schema: t.inputSchema }));

async function connect(spec, cwd) {
  const transport = new StdioClientTransport({ command: spec.command, args: spec.args ?? [], env: { ...process.env, ...(spec.env ?? {}) }, cwd, stderr: "ignore" });
  const client = new Client({ name: "factory-bench", version: "1" });
  await client.connect(transport);
  return client;
}

/**
 * One task through an OpenAI chat-completions tool loop (OPENAI_API_KEY; any OpenAI-compatible
 * endpoint via OPENAI_BASE_URL). Same system prompt, same grading, same accounting as the
 * Anthropic loop, so the two arms of a comparison differ only in the server.
 */
async function runTaskOpenAI(model, mcp, tools, task) {
  const trace = [];
  const base = process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";
  const fnTools = tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.input_schema } }));
  const messages = [{ role: "system", content: SYSTEM }, { role: "user", content: task.prompt }];
  const usage = { input: 0, output: 0, cache_read: 0, cache_write: 0 };
  let toolCalls = 0;
  let finalText = "";
  let requestError;
  const resolvedModels = new Set();
  const started = performance.now();
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    let res;
    // Rate limits, server errors and dropped connections are retried; a stalled request is cut at
    // two minutes. The wait counts toward the task's time, which is why the median is reported.
    for (let attempt = 0; ; attempt++) {
      try {
        res = await fetch(`${base}/chat/completions`, { method: "POST", headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ model, messages, tools: fnTools }), signal: AbortSignal.timeout(120_000) });
      } catch (err) {
        if (attempt >= 5) throw err;
        res = undefined;
      }
      if ((res && res.status !== 429 && res.status < 500) || attempt >= 5) break;
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
    }
    if (!res.ok) {
      // A request the API will not take (larger than the per-minute token limit, after retries) ends
      // the task as failed, with the reason recorded; the run goes on.
      const text = await res.text();
      requestError = `OpenAI answered ${res.status}: ${(text.match(/"message":\s*"([^"]*)"/)?.[1] ?? text).slice(0, 200)}`;
      break;
    }
    const d = await res.json();
    if (typeof d.model === "string") resolvedModels.add(d.model);
    const cached = d.usage?.prompt_tokens_details?.cached_tokens ?? 0;
    usage.input += (d.usage?.prompt_tokens ?? 0) - cached;
    usage.cache_read += cached;
    usage.output += d.usage?.completion_tokens ?? 0;
    const msg = d.choices?.[0]?.message ?? {};
    finalText = msg.content ?? "";
    const calls = msg.tool_calls ?? [];
    if (!calls.length) break;
    messages.push({ role: "assistant", content: msg.content ?? null, tool_calls: calls });
    for (const call of calls) {
      toolCalls++;
      let content;
      let failed = false;
      try {
        const out = await mcp.callTool({ name: call.function.name, arguments: JSON.parse(call.function.arguments || "{}") });
        content = (out.content ?? []).filter((c) => c.type === "text").map((c) => c.text).join("\n") || JSON.stringify(out.structuredContent ?? {});
        failed = Boolean(out.isError);
      } catch (err) {
        content = `Tool call failed: ${err.message}`;
        failed = true;
      }
      trace.push({ tool: call.function.name, args: call.function.arguments.slice(0, 300), ...(failed ? { error: content.slice(0, 300) } : {}) });
      messages.push({ role: "tool", tool_call_id: call.id, content });
    }
  }
  if (finalText.length > 64_000) throw new Error("Final benchmark answer exceeds the evidence limit.");
  return { id: task.id, correct: !requestError && grade(task.expect, finalText), final_text: finalText, resolved_model: resolvedModels.size === 1 ? [...resolvedModels][0] : null, answer: (finalText.match(/ANSWER:\s*(.*)$/im)?.[1] ?? finalText).trim().slice(0, 200), tool_calls: toolCalls, trace, ...usage, ms: Math.round(performance.now() - started), ...(requestError ? { error: requestError } : {}) };
}

async function runTask(anthropic, model, mcp, tools, task) {
  const messages = [{ role: "user", content: task.prompt }];
  const usage = { input: 0, output: 0, cache_read: 0, cache_write: 0 };
  let toolCalls = 0;
  let finalText = "";
  const resolvedModels = new Set();
  const started = performance.now();
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const res = await anthropic.messages.create({ model, max_tokens: 4000, system: SYSTEM, tools, messages });
    if (typeof res.model === "string") resolvedModels.add(res.model);
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
  if (finalText.length > 64_000) throw new Error("Final benchmark answer exceeds the evidence limit.");
  return { id: task.id, correct: grade(task.expect, finalText), final_text: finalText, resolved_model: resolvedModels.size === 1 ? [...resolvedModels][0] : null, answer: (finalText.match(/ANSWER:\s*(.*)$/im)?.[1] ?? finalText).trim().slice(0, 200), tool_calls: toolCalls, ...usage, ms: Math.round(performance.now() - started) };
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
  const { values, positionals } = parseArgs({ allowPositionals: true, options: { provider: { type: "string", default: "anthropic" }, model: { type: "string" }, arm: { type: "string", default: "both" }, dry: { type: "boolean", default: false } } });
  values.model ??= values.provider === "openai" ? "gpt-5.4-mini" : "claude-opus-4-8";
  const dir = path.resolve(positionals[0] ?? "");
  const spec = readJson(path.join(dir, "bench/tasks.json"));
  const source = sourceSnapshot(dir);
  const arms = { ours: { command: process.execPath, args: [path.join(dir, "src/server.mjs")] } };
  if (spec.competitor && values.arm !== "ours") arms.competitor = spec.competitor;
  if (values.arm === "competitor") delete arms.ours;

  const anthropic = values.provider === "anthropic" ? new Anthropic() : null;
  const result = { schema: "canlilabs.benchmark.v2", measured_at: new Date().toISOString(), date: new Date().toISOString().slice(0, 10), provider: values.provider, model: values.model, competitor_label: spec.competitor?.label ?? "", provenance: { source_sha256: source.sha256, tasks_sha256: identityHash(spec), competitor_sha256: identityHash(spec.competitor ?? null), runner_sha256: hash(readFileSync(new URL(import.meta.url))), node: process.version, system_sha256: hash(SYSTEM), max_turns: MAX_TURNS }, rows: {}, summary: {} };
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
      const row = values.provider === "openai" ? await runTaskOpenAI(values.model, mcp, anthropicTools, task) : await runTask(anthropic, values.model, mcp, anthropicTools, task);
      result.rows[arm].push(row);
      process.stderr.write(`  ${arm} ${task.id}: ${row.correct ? "correct" : "WRONG"} ${row.input + row.cache_read}+${row.output} tok ${row.ms} ms${row.correct ? "" : ` answered: ${row.answer}${row.error ? ` | ${row.error}` : ""}${row.trace?.length ? ` | calls: ${JSON.stringify(row.trace)}` : ""}`}\n`);
    }
    result.summary[arm] = summarize(result.rows[arm]);
    await mcp.close();
  }
  if (!values.dry) {
    if (sourceSnapshot(dir).sha256 !== source.sha256) throw new Error("Server source changed during benchmarking; keep the failed attempt and rerun the fixed corpus.");
    mkdirSync(path.join(dir, "bench/results"), { recursive: true });
    const id = result.measured_at.replace(/[:.]/g, "-");
    writeFileSync(path.join(dir, `bench/results/${id}-${values.model}.json`), `${JSON.stringify(result, null, 2)}\n`, { flag: "wx" });
    if (result.summary.ours) {
      const readme = path.join(dir, "README.md");
      writeFileSync(readme, replaceBlock(readFileSync(readme, "utf8"), "bench", renderBench(result)));
    }
    process.stdout.write(`${JSON.stringify(result.summary, null, 2)}\n`);
  }
}
