// Weekly canary (.github/workflows/canary.yml): the tools against live Earth Search. Asserts only
// facts that should not change.
import assert from "node:assert/strict";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildServer } from "../src/server.mjs";

const client = new Client({ name: "canary", version: "0" });
const [a, b] = InMemoryTransport.createLinkedPair();
await Promise.all([buildServer().connect(a), client.connect(b)]);

test("live: a past period still returns the same well-covered scenes", { timeout: 90_000 }, async () => {
  const r = await client.callTool({ name: "find_imagery", arguments: { lat: 25.197, lon: 55.274, start: "2026-08-01", end: "2026-09-26", limit: 3 } });
  assert.ok(r.structuredContent.scenes.length > 0);
  assert.equal(r.structuredContent.scenes[0].area_covered_pct, 100);
  const s = await client.callTool({ name: "scene_assets", arguments: { collection: "sentinel-2", id: "S2B_T40RCN_20260830T065854_L2A" } });
  assert.ok(s.structuredContent.assets.some((x) => x.key === "red" && x.resolution_m === 10));
  await client.close();
});
