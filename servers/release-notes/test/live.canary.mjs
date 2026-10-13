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

test("live: express's changelog still says when req.param() was deprecated", { timeout: 90_000 }, async (t) => {
  t.after(() => client.close());
  const r = await client.callTool({ name: "search_changelog", arguments: { ecosystem: "npm", package: "express", text: "req.param(" } });
  assert.ok(!r.isError, r.content?.[0]?.text ?? "Upstream returned a tool error.");
  // Express no longer puts dates in History.md. The tool correctly falls back to the
  // registry's publication date, which can differ from the old local release date.
  // Assert the stable historical version and the actual deprecation statement.
  assert.ok(r.structuredContent.hits.some((h) => /^4\.11\.0(?: \(\d{4}-\d{2}-\d{2}\))?:.*Deprecate `req\.param\(\)`/.test(h)));
});
