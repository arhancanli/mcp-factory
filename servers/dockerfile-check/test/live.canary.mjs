// Weekly canary (.github/workflows/canary.yml): Docker Hub, GHCR and endoflife.date, live.
// Asserts only facts that should not change (node:16 exists and is past its end of life; a tag that
// never existed does not).
import assert from "node:assert/strict";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildServer } from "../src/server.mjs";

const client = new Client({ name: "canary", version: "0" });
const [a, b] = InMemoryTransport.createLinkedPair();
await Promise.all([buildServer().connect(a), client.connect(b)]);
await client.listTools();

test("live: registries and end-of-life dates answer as they did", { timeout: 90_000 }, async () => {
  const r = await client.callTool({ name: "image_info", arguments: { images: ["node:16-alpine", "node:16.99-alpine", "ghcr.io/actions/actions-runner:2.328.0"] } });
  const [old, missing, runner] = r.structuredContent.images;
  assert.equal(old.exists, true);
  assert.ok(old.lifecycle.some((l) => l.status === "end_of_life"), JSON.stringify(old));
  assert.equal(missing.exists, false);
  assert.ok(missing.nearest_tags.some((t) => t.startsWith("16")), JSON.stringify(missing));
  assert.match(runner.pin, /@sha256:[0-9a-f]{64}$/);
  await client.close();
});
