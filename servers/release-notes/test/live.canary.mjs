// Weekly canary (.github/workflows/canary.yml): deps.dev, the npm registry and a live changelog.
// Asserts only facts that should not change (old express releases).
import assert from "node:assert/strict";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildServer } from "../src/server.mjs";

const client = new Client({ name: "canary", version: "0" });
const [a, b] = InMemoryTransport.createLinkedPair();
await Promise.all([buildServer().connect(a), client.connect(b)]);
await client.listTools();

test("live: express's changelog still says when req.param() was deprecated", { timeout: 90_000 }, async () => {
  const r = await client.callTool({ name: "search_changelog", arguments: { ecosystem: "npm", package: "express", text: "req.param(" } });
  assert.ok(r.structuredContent.hits.some((h) => h.startsWith("4.11.0 (2015-01-13)")));
  await client.close();
});
