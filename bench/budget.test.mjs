// All model responses are explicit test fixtures through the official SDK's fetch adapter.
// No real model/API call is made, and synthetic benchmarks live only in temporary Git repos.
import assert from "node:assert/strict";
import test from "node:test";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, readdirSync, existsSync, rmSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { RequestBudget, BudgetExhaustedError, BudgetAccountingError, parseUsd,
  usageCeilingMicroUsd, REQUEST_RESERVATION_MICRO_USD, budgetClientOptions } from "./budget.mjs";
import { executeBenchmark, runTask } from "./run.mjs";
import { openJournal } from "./journal.mjs";

const NOW = Date.parse("2026-10-14T12:00:00Z");
const message = (overrides = {}) => ({ id: "msg_test", type: "message", role: "assistant", model: "claude-opus-4-8",
  content: [{ type: "text", text: "ANSWER: 42" }], stop_reason: "end_turn", stop_sequence: null,
  usage: { input_tokens: 20, output_tokens: 10, cache_creation_input_tokens: 0, cache_read_input_tokens: 0,
    service_tier: "standard", inference_geo: "global" }, ...overrides });
const budget = (usd = "50", record) => new RequestBudget({ usd, provider: "anthropic", model: "claude-opus-4-8", now: NOW, record });
const fixture = (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), "canlilabs-budget-fixture-"));
  const directory = path.join(root, "server");
  mkdirSync(directory);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(path.join(directory, "bench"));
  mkdirSync(path.join(directory, "src"));
  writeFileSync(path.join(directory, "src/server.mjs"), "// Synthetic control-flow fixture, not a deployed server.\n");
  writeFileSync(path.join(directory, "bench/tasks.json"), JSON.stringify({
    competitor: { label: "Synthetic comparison fixture", command: "fixture", args: [] },
    tasks: Array.from({ length: 10 }, (_, i) => ({ id: `task-${i}`, prompt: "Fixture question", expect: { number: 42 } })),
  }));
  writeFileSync(path.join(directory, "README.md"), "Fixture\n<!-- bench:start -->\npending\n<!-- bench:end -->\n");
  const git = (...args) => execFileSync("git", args, { cwd: directory, stdio: "pipe" });
  git("init", "-q");
  git("add", ".");
  git("-c", "user.name=Arhan Canli", "-c", "user.email=arhan.canli@canli.capital", "-c", "commit.gpgsign=false", "commit", "-qm", "Synthetic fixture");
  return directory;
};
function adapters({ failAt = null, response = message() } = {}) {
  const state = { requests: [], closed: 0, connected: 0 };
  const connector = async () => {
    state.connected++;
    return { listTools: async () => ({ tools: [{ name: "fixture", description: "Fixture", inputSchema: { type: "object" } }] }),
      callTool: async () => ({ content: [{ type: "text", text: "42" }] }), close: async () => { state.closed++; } };
  };
  const clientFactory = (options) => new Anthropic({ ...options, apiKey: "test-fixture-key", fetch: async (_url, init) => {
    state.requests.push(JSON.parse(init.body));
    return new Response(JSON.stringify(state.requests.length === failAt ? { type: "error", error: { type: "api_error", message: "private upstream fixture body" } } : response),
      { status: state.requests.length === failAt ? 500 : 200, headers: { "content-type": "application/json" } });
  } });
  return { state, connector, clientFactory, now: () => NOW };
}
const events = (file) => readFileSync(file, "utf8").trim().split("\n").map(JSON.parse);

test("USD parsing and priced-profile freshness reject unknown financial assumptions", () => {
  assert.equal(parseUsd("50.000001"), 50_000_001);
  for (const invalid of ["50e0", "NaN", "-1", "0", "10001", "50.0000001", 50]) assert.throws(() => parseUsd(invalid));
  assert.throws(() => new RequestBudget({ usd: "50", provider: "openai", model: "gpt-5.4-mini", now: NOW }), /supports/);
  assert.throws(() => new RequestBudget({ usd: "50", provider: "anthropic", model: "claude-opus-4-8", now: Date.parse("2026-10-21") }), /Refresh/);
  assert.equal(REQUEST_RESERVATION_MICRO_USD, 12_702_912);
});

test("verified usage refunds unused exposure, while invalid/missing usage retains the reservation", () => {
  const ledger = budget();
  const id = ledger.reserve({ task: "fixture" });
  assert.equal(ledger.snapshot().unresolved_reservations_micro_usd, REQUEST_RESERVATION_MICRO_USD);
  assert.equal(ledger.settle(id, message()), 420);
  assert.equal(ledger.snapshot().remaining_micro_usd, 49_999_580);
  const second = ledger.reserve({ task: "invalid" });
  assert.throws(() => ledger.settle(second, message({ usage: {} })), BudgetAccountingError);
  assert.equal(ledger.snapshot().unresolved_reservations_micro_usd, REQUEST_RESERVATION_MICRO_USD);
  const cached = message({ usage: { ...message().usage, input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 1, cache_read_input_tokens: 1 } });
  assert.equal(usageCeilingMicroUsd(cached), 14);
});

test("unexpected model, token bounds, service tiers or server fees fail accounting closed", () => {
  for (const response of [message({ model: "other" }), message({ usage: { ...message().usage, input_tokens: -1 } }),
    message({ usage: { ...message().usage, output_tokens: 4001 } }), message({ usage: { ...message().usage, input_tokens: 1_048_577 } }),
    message({ usage: { ...message().usage, service_tier: "priority" } }), message({ usage: { ...message().usage, inference_geo: "us" } }),
    message({ usage: { ...message().usage, server_tool_use: { web_search_requests: 1 } } })]) {
    assert.throws(() => usageCeilingMicroUsd(response), BudgetAccountingError);
  }
});

test("the next model request is never issued when its complete exposure exceeds remaining allowance", async () => {
  const ledger = budget("12.71");
  let requests = 0;
  const client = { messages: { create: async () => {
    requests++;
    return message({ usage: { ...message().usage, input_tokens: 5000 }, stop_reason: "tool_use",
      content: [{ type: "tool_use", id: "call_1", name: "fixture", input: {} }] });
  } } };
  const mcp = { callTool: async () => ({ content: [{ type: "text", text: "42" }] }) };
  await assert.rejects(runTask(client, "claude-opus-4-8", mcp, [], { id: "fixture", prompt: "fixture", expect: { number: 42 } }, ledger), BudgetExhaustedError);
  assert.equal(requests, 1);
});

test("dry preparation connects both arms, closes them and never constructs a paid client or journal", async (t) => {
  const directory = fixture(t);
  const mocks = adapters();
  const file = path.join(directory, "..", "journal.jsonl");
  const plan = await executeBenchmark({ directory, dry: true, budgetUsd: "50", journal: file }, {
    connector: mocks.connector, clientFactory: () => { throw new Error("A dry run must not construct a client"); }, now: () => NOW,
  });
  assert.equal(plan.agent_benchmark_executed, false);
  assert.equal(plan.maximum_model_requests, 160);
  assert.equal(mocks.state.closed, 2);
  assert.equal(existsSync(file), false);
  assert.equal(existsSync(path.join(directory, "bench/results")), false);
});

test("a full synthetic paired run persists every priced request and task before producing its result", async (t) => {
  const directory = fixture(t);
  const file = path.join(directory, "..", "journal.jsonl");
  const mocks = adapters();
  const result = await executeBenchmark({ directory, budgetUsd: "50", journal: file }, mocks);
  assert.equal(result.rows.ours.length, 10);
  assert.equal(result.rows.competitor.length, 10);
  assert.equal(result.budget.requests, 20);
  assert.equal(result.budget.verified_usage_ceiling_micro_usd, 8400);
  assert.equal(result.budget.unresolved_reservations_micro_usd, 0);
  assert.equal(mocks.state.closed, 2);
  assert.ok(mocks.state.requests.every((request) => request.max_tokens === 4000 && request.service_tier === "standard_only" && request.inference_geo === "global"));
  const journal = events(file);
  assert.equal(journal.filter((event) => event.event === "task_completed").length, 20);
  assert.equal(journal.at(-1).event, "attempt_completed");
  assert.equal(readdirSync(path.join(directory, "bench/results")).length, 1);
  const original = readFileSync(file);
  const next = adapters();
  await assert.rejects(executeBenchmark({ directory, budgetUsd: "50", journal: file }, next), /EEXIST/);
  assert.equal(next.state.requests.length, 0);
  assert.deepEqual(readFileSync(file), original);
});

test("SDK failures are not retried, preserve completed rows/unknown charges, close the peer and cannot look like a complete benchmark", async (t) => {
  const directory = fixture(t);
  const file = path.join(directory, "..", "journal.jsonl");
  const original = readFileSync(path.join(directory, "README.md"));
  const mocks = adapters({ failAt: 3 });
  await assert.rejects(executeBenchmark({ directory, budgetUsd: "50", journal: file }, mocks));
  assert.equal(mocks.state.requests.length, 3);
  assert.equal(mocks.state.closed, 1);
  const journal = events(file);
  const failure = journal.at(-1);
  assert.equal(failure.event, "attempt_failed");
  assert.equal(failure.completed_rows.ours, 2);
  assert.equal(failure.budget.unresolved_reservations_micro_usd, REQUEST_RESERVATION_MICRO_USD);
  assert.equal(failure.budget.verified_usage_ceiling_micro_usd, 840);
  assert.equal(readFileSync(file, "utf8").includes("private upstream fixture body"), false);
  assert.equal(existsSync(path.join(directory, "bench/results")), false);
  assert.deepEqual(readFileSync(path.join(directory, "README.md")), original);
});

test("journal rows survive a killed process and existing allowance files cannot be overwritten", (t) => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "canlilabs-journal-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, "journal.jsonl");
  const module = new URL("./journal.mjs", import.meta.url).href;
  assert.throws(() => execFileSync(process.execPath, ["--input-type=module", "-e",
    `import {openJournal} from ${JSON.stringify(module)}; const j=openJournal(${JSON.stringify(file)},{}); j.record({event:'request_reserved',micro_usd:12702912}); process.kill(process.pid,'SIGKILL');`], { stdio: "ignore" }));
  assert.equal(events(file).at(-1).event, "request_reserved");
  assert.throws(() => openJournal(file, {}), /EEXIST/);
  assert.equal(budgetClientOptions().maxRetries, 0);
});

test("an ordinary invocation cannot issue paid requests without an explicit financial policy", async (t) => {
  const directory = fixture(t);
  const mocks = adapters();
  await assert.rejects(executeBenchmark({ directory }, mocks), /Paid execution requires/);
  assert.equal(mocks.state.requests.length, 0);
  assert.equal(mocks.state.connected, 0);
  await assert.rejects(executeBenchmark({ directory, dry: true, budgetUsd: "50", journal: path.join(directory, "journal.jsonl") }, mocks), /outside/);
  assert.equal(mocks.state.requests.length, 0);
});

test("the Anthropic loop retains actual tool choice and marks bounded argument traces", async () => {
  let turn = 0;
  const argument = "x".repeat(400);
  const client = { messages: { create: async () => ++turn === 1 ? message({ stop_reason: "tool_use",
    content: [{ type: "tool_use", id: "call_1", name: "fixture", input: { value: argument } }] }) : message() } };
  const mcp = { callTool: async (request) => {
    assert.equal(request.arguments.value, argument);
    return { content: [{ type: "text", text: "42" }] };
  } };
  const row = await runTask(client, "claude-opus-4-8", mcp, [], { id: "fixture", prompt: "fixture", expect: { number: 42 } }, budget());
  assert.equal(row.correct, true);
  assert.equal(row.trace[0].tool, "fixture");
  assert.equal(row.trace[0].args.length, 300);
  assert.equal(row.trace[0].args_truncated, true);
  assert.equal(row.tool_calls, 1);
});
