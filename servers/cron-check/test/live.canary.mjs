// Weekly canary (.github/workflows/canary.yml): the tools on the real clock, with the time zone
// database of the Node that runs them.
import assert from "node:assert/strict";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildServer } from "../src/server.mjs";

const client = new Client({ name: "canary", version: "0" });
const [a, b] = InMemoryTransport.createLinkedPair();
await Promise.all([buildServer().connect(a), client.connect(b)]);
await client.listTools();

test("live: the next hourly run is within the hour", async () => {
  const r = await client.callTool({ name: "next_runs", arguments: { expression: "0 * * * *", count: 1 } });
  const next = Date.parse(r.structuredContent.runs[0].utc);
  assert.ok(next > Date.now() && next - Date.now() <= 3_600_000);
  await client.close();
});
