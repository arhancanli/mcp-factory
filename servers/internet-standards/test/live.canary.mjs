// Weekly canary (.github/workflows/canary.yml): the tools against the live RFC Editor and IANA.
// Asserts only facts that should not change.
import assert from "node:assert/strict";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildServer } from "../src/server.mjs";

const client = new Client({ name: "canary", version: "0" });
const [a, b] = InMemoryTransport.createLinkedPair();
await Promise.all([buildServer().connect(a), client.connect(b)]);

test("live: known facts still come back from the RFC Editor and IANA", { timeout: 120_000 }, async () => {
  const info = await client.callTool({ name: "rfc_info", arguments: { ids: ["RFC 2616"] } });
  assert.ok(info.structuredContent.results[0].current_replacements.includes("RFC 9110"));
  const sec = await client.callTool({ name: "rfc_section", arguments: { rfc: "9110", section: "15.5.5" } });
  assert.equal(sec.structuredContent.section_title, "404 Not Found");
  const port = await client.callTool({ name: "iana_lookup", arguments: { registry: "port-numbers", query: "5432" } });
  assert.equal(port.structuredContent.entries[0]["Service Name"], "postgresql");
  const search = await client.callTool({ name: "search_rfcs", arguments: { query: "http semantics" } });
  assert.equal(search.structuredContent.results[0].rfc, "RFC 9110");
  await client.close();
});
