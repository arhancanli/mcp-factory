// Weekly canary (.github/workflows/canary.yml): the tools against live RxNorm, DailyMed and
// openFDA. Asserts only facts that should not change.
import assert from "node:assert/strict";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildServer } from "../src/server.mjs";

const client = new Client({ name: "canary", version: "0" });
const [a, b] = InMemoryTransport.createLinkedPair();
await Promise.all([buildServer().connect(a), client.connect(b)]);

test("live: known label facts still come back", { timeout: 120_000 }, async () => {
  const drug = await client.callTool({ name: "find_drug", arguments: { name: "atorvastatin" } });
  assert.ok(drug.structuredContent.brands.includes("Lipitor"));
  const boxed = await client.callTool({ name: "label_section", arguments: { drug: "warfarin", topic: "boxed_warning" } });
  assert.match(boxed.structuredContent.sections[0].text, /bleeding/i);
  const grape = await client.callTool({ name: "search_label", arguments: { drug: "Lipitor", term: "grapefruit" } });
  assert.ok(grape.structuredContent.total > 0);
  const rec = await client.callTool({ name: "recalls_shortages", arguments: { drug: "metformin" } });
  assert.ok(rec.structuredContent.recalls_total > 0);
  await client.close();
});
