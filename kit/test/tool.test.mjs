// kit/test/tool.test.mjs: the factory's tool rules are enforced at definition time, and the
// wrapper turns every failure into a short isError result, over a real MCP client connection.
import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer, defineTool, ToolError, UpstreamError, page, clip, compact } from "../index.mjs";

const ANN = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };
const base = {
  name: "echo_word",
  title: "Echo a word",
  description: "Returns the word you send.",
  input: { word: z.string().max(20) },
  output: { word: z.string() },
  annotations: ANN,
  handler: async ({ word }) => ({ word }),
};

test("defineTool accepts a tool that follows every rule", () => {
  assert.equal(defineTool(base).name, "echo_word");
});

test("defineTool refuses each broken rule by name", () => {
  const cases = [
    [{ name: "Bad-Name" }, "snake_case"],
    [{ title: "" }, "title"],
    [{ description: "x".repeat(401) }, "401 chars"],
    [{ annotations: { ...ANN, openWorldHint: undefined } }, "openWorldHint"],
    [{ output: {} }, "output schema"],
    [{ input: { q: z.string() } }, "q: string has no max length"],
    [{ input: { url: z.url() } }, "url: string has no max length"],
    [{ input: { ids: z.array(z.string().max(5)) } }, "ids: array has no max size"],
    [{ input: { ids: z.array(z.string()).max(3) } }, "ids[]: string has no max length"],
    [{ input: { f: z.object({ deep: z.string().optional() }) } }, "f.deep: string has no max length"],
  ];
  for (const [patch, needle] of cases) {
    assert.throws(() => defineTool({ ...base, ...patch }), (err) => err.message.includes(needle), `expected refusal mentioning ${needle}`);
  }
});

async function connect(tools) {
  const server = createServer({ name: "t", version: "0.0.0", tools, ctx: {} });
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "c", version: "0" });
  await Promise.all([server.connect(a), client.connect(b)]);
  return client;
}

test("results carry compact text and matching structured content", async () => {
  const client = await connect([defineTool(base)]);
  const res = await client.callTool({ name: "echo_word", arguments: { word: "hi" } });
  assert.equal(res.content[0].text, '{"word":"hi"}');
  assert.deepEqual(res.structuredContent, { word: "hi" });
  assert.ok(!res.isError);
});

test("ToolError, UpstreamError and unexpected errors become short isError results", async () => {
  const logged = [];
  const origWrite = process.stderr.write.bind(process.stderr);
  process.stderr.write = (s) => (logged.push(String(s)), true);
  try {
    const client = await connect([
      defineTool({ ...base, name: "tool_err", handler: async () => { throw new ToolError("not_found", "No such word; try a shorter one."); } }),
      defineTool({ ...base, name: "up_err", handler: async () => { throw new UpstreamError("upstream_timeout", "api.example.org did not answer within 10 ms."); } }),
      defineTool({ ...base, name: "boom", handler: async () => { throw new RangeError("secret internal detail"); } }),
    ]);
    const a = await client.callTool({ name: "tool_err", arguments: { word: "x" } });
    assert.equal(a.isError, true);
    assert.deepEqual(JSON.parse(a.content[0].text), { error: { code: "not_found", message: "No such word; try a shorter one." } });
    const b = await client.callTool({ name: "up_err", arguments: { word: "x" } });
    assert.equal(JSON.parse(b.content[0].text).error.code, "upstream_timeout");
    const c = await client.callTool({ name: "boom", arguments: { word: "x" } });
    assert.equal(JSON.parse(c.content[0].text).error.code, "internal_error");
    assert.ok(!c.content[0].text.includes("secret internal detail"));
    assert.ok(logged.some((l) => l.includes("secret internal detail")), "the real cause is logged on the server");
  } finally {
    process.stderr.write = origWrite;
  }
});

test("oversized input is refused by the schema before the handler runs", async () => {
  let ran = false;
  const client = await connect([defineTool({ ...base, handler: async (a) => ((ran = true), a) })]);
  const res = await client.callTool({ name: "echo_word", arguments: { word: "x".repeat(21) } });
  assert.equal(res.isError, true);
  assert.equal(ran, false);
});

test("tools/list is sorted by name and carries annotations and output schemas", async () => {
  const client = await connect([defineTool({ ...base, name: "zeta" }), defineTool({ ...base, name: "alpha" })]);
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((t) => t.name), ["alpha", "zeta"]);
  for (const t of tools) {
    assert.equal(t.annotations.readOnlyHint, true);
    assert.equal(t.outputSchema.type, "object");
  }
});

test("duplicate tool names are refused", () => {
  assert.throws(() => createServer({ name: "t", version: "0", tools: [defineTool(base), defineTool(base)], ctx: {} }), /Duplicate/);
});

test("page, clip and compact never hide that something was left out", () => {
  assert.deepEqual(page([1, 2, 3], 2), { items: [1, 2], total: 3, returned: 2, truncated: true });
  assert.deepEqual(page([1], 5), { items: [1], total: 1, returned: 1, truncated: false });
  assert.equal(clip("abcdef", 3), "abc [clipped: 3 more characters]");
  assert.deepEqual(compact({ a: 1, b: null, c: "", d: [], e: 0 }), { a: 1, e: 0 });
});

test("tools/list is lean: no $schema, no empty fields, title not repeated in annotations", async () => {
  const client = await connect([defineTool(base)]);
  const { tools } = await client.listTools();
  const text = JSON.stringify(tools);
  assert.ok(!text.includes("$schema"));
  assert.ok(!text.includes("execution"));
  assert.equal(tools[0].annotations.title, undefined);
  assert.deepEqual(tools[0].inputSchema.properties.word, { type: "string", maxLength: 20 });
  assert.deepEqual(tools[0].inputSchema.required, ["word"]);
});

test("the SDK still validates input against the schema after the list is replaced", async () => {
  const client = await connect([defineTool(base)]);
  const res = await client.callTool({ name: "echo_word", arguments: {} });
  assert.equal(res.isError, true);
});
