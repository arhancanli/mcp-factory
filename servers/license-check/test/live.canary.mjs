// Weekly canary (.github/workflows/canary.yml): the SPDX list and OSADL's matrix, live. Asserts
// only verdicts that should not change.
import assert from "node:assert/strict";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildServer } from "../src/server.mjs";

const client = new Client({ name: "canary", version: "0" });
const [a, b] = InMemoryTransport.createLinkedPair();
await Promise.all([buildServer().connect(a), client.connect(b)]);
await client.listTools();

test("live: Apache-2.0 still does not go into GPL-2.0-only, and does into GPL-3.0-only", { timeout: 90_000 }, async () => {
  const two = await client.callTool({ name: "check_compatibility", arguments: { project: "GPL-2.0-only", licenses: ["Apache-2.0"] } });
  assert.equal(two.structuredContent.results[0].verdict, "no");
  const three = await client.callTool({ name: "check_compatibility", arguments: { project: "GPL-3.0-only", licenses: ["Apache-2.0"] } });
  assert.equal(three.structuredContent.results[0].verdict, "yes");
  await client.close();
});
