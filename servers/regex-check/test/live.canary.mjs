// Weekly canary (.github/workflows/canary.yml): the engines as installed from npm, on the Node that
// runs them: all four start and keep their known differences.
import assert from "node:assert/strict";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { stopEngines } from "../src/engines.mjs";
import { buildServer, createContext } from "../src/server.mjs";

const ctx = createContext();
const client = new Client({ name: "canary", version: "0" });
const [a, b] = InMemoryTransport.createLinkedPair();
await Promise.all([buildServer(ctx).connect(a), client.connect(b)]);
await client.listTools();

test("live: four engines start, and $ before a final newline still divides them", { timeout: 60_000 }, async () => {
  const r = await client.callTool({ name: "test_regex", arguments: { pattern: "^abc$", inputs: ["abc\n"] } });
  const counts = Object.fromEntries(r.structuredContent.engines.map((e) => [e.flavor, e.results[0].match_count]));
  assert.deepEqual(counts, { javascript: 0, python: 1, pcre: 1, re2: 0 });
  await client.close();
  await stopEngines(ctx);
});
