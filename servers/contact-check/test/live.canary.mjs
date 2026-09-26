// Weekly canary (.github/workflows/canary.yml): DNS, the disposable list and Google's address data,
// live. Asserts only facts that should not change.
import assert from "node:assert/strict";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildServer } from "../src/server.mjs";

const client = new Client({ name: "canary", version: "0" });
const [a, b] = InMemoryTransport.createLinkedPair();
await Promise.all([buildServer().connect(a), client.connect(b)]);
await client.listTools();

test("live: example.com takes no mail; a US ZIP pattern; gmail's typo", { timeout: 60_000 }, async () => {
  const e = await client.callTool({ name: "check_emails", arguments: { emails: ["a@example.com", "b@gmial.com"] } });
  assert.match(e.structuredContent.results[0].reason, /null MX/);
  assert.equal(e.structuredContent.results[1].did_you_mean, "b@gmail.com");
  const ad = await client.callTool({ name: "check_addresses", arguments: { addresses: [{ country: "US", street: ["1 Main St"], city: "Boston", region: "MA", postal_code: "02108" }] } });
  assert.equal(ad.structuredContent.results[0].valid, true);
  await client.close();
});
