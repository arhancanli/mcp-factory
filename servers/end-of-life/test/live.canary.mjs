// Weekly canary (.github/workflows/canary.yml): the tools against live endoflife.date. Asserts only
// facts that should not change (past end-of-life dates, codename mapping).
import assert from "node:assert/strict";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildServer } from "../src/server.mjs";

const client = new Client({ name: "canary", version: "0" });
const [a, b] = InMemoryTransport.createLinkedPair();
await Promise.all([buildServer().connect(a), client.connect(b)]);

test("live: past end-of-life dates still come back", { timeout: 60_000 }, async () => {
  const r = await client.callTool({ name: "check_versions", arguments: { items: ["python 3.8", "node 18"] } });
  const by = Object.fromEntries(r.structuredContent.results.map((x) => [x.product, x]));
  assert.equal(by.python.eol, "2024-10-07");
  assert.equal(by.nodejs.status, "end_of_life");
  const p = await client.callTool({ name: "check_project", arguments: { files: [{ path: ".nvmrc", content: "lts/hydrogen" }] } });
  assert.equal(p.structuredContent.results[0].version, "18");
  await client.close();
});
