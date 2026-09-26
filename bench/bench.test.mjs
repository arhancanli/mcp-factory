// bench/bench.test.mjs: the benchmark's grading and summaries, offline.
import assert from "node:assert/strict";
import test from "node:test";
import { grade, renderBench, summarize, toAnthropicTools } from "./run.mjs";

test("grade reads only the ANSWER line and applies each rule", () => {
  assert.equal(grade({ contains: ["paris"] }, "Thinking about Paris...\nANSWER: Paris, France"), true);
  assert.equal(grade({ contains: ["paris"] }, "Paris is mentioned here but no answer line"), false);
  assert.equal(grade({ any: ["1969", "nineteen"] }, "ANSWER: 1969"), true);
  assert.equal(grade({ regex: "^RFC ?9110$" }, "ANSWER: RFC 9110"), true);
  assert.equal(grade({ number: 42.5, tol: 0.1 }, "ANSWER: about 42.55 units"), true);
  assert.equal(grade({ number: 1234567 }, "ANSWER: 1,234,567"), true);
  assert.equal(grade({ number: 10, tol: 0.5 }, "ANSWER: 11"), false);
  assert.throws(() => grade({}, "ANSWER: x"), /no recognised expect rule/);
});

test("summaries count cached input as input and report the cached share", () => {
  const s = summarize([
    { correct: true, tool_calls: 1, input: 100, output: 10, cache_read: 900, cache_write: 0, ms: 1000 },
    { correct: false, tool_calls: 2, input: 200, output: 20, cache_read: 0, cache_write: 800, ms: 3000 },
  ]);
  assert.deepEqual(s, { tasks: 2, correct: 1, tokens_in: 2000, tokens_out: 30, cached_share: 0.45, tool_calls: 3, median_ms: 3000 });
  const table = renderBench({ date: "2026-09-26", model: "m", competitor_label: "Other", summary: { ours: s, competitor: s } });
  assert.match(table, /\| This server \| 1\/2 \| 2000 \| 30 \| 3 \| 3\.0 s \|/);
  assert.match(table, /\| Other \|/);
});

test("MCP tools map to Anthropic tool definitions unchanged", () => {
  const schema = { type: "object", properties: { q: { type: "string", maxLength: 5 } } };
  assert.deepEqual(toAnthropicTools([{ name: "a", description: "d", inputSchema: schema }]), [{ name: "a", description: "d", input_schema: schema }]);
});
