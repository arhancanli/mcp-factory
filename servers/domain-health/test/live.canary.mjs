// Weekly canary (.github/workflows/canary.yml): the tools against live resolvers, IANA's RDAP
// bootstrap, the Public Suffix List and a registry's RDAP server. Asserts only facts that should
// not change (a registration date, Google's sending range passing Gmail's SPF).
import assert from "node:assert/strict";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildServer } from "../src/server.mjs";

const client = new Client({ name: "canary", version: "0" });
const [a, b] = InMemoryTransport.createLinkedPair();
await Promise.all([buildServer().connect(a), client.connect(b)]);
await client.listTools();

test("live: RDAP, SPF evaluation and DNS still answer", { timeout: 90_000 }, async () => {
  const reg = await client.callTool({ name: "domain_lookup", arguments: { domains: ["mail.google.com"] } });
  assert.deepEqual([reg.structuredContent.results[0].domain, reg.structuredContent.results[0].created], ["google.com", "1997-09-15"]);
  const spf = await client.callTool({ name: "check_spf", arguments: { domain: "gmail.com", ip: "209.85.220.41" } });
  assert.equal(spf.structuredContent.result, "pass");
  const dns = await client.callTool({ name: "dns_lookup", arguments: { name: "google.com", types: ["NS"] } });
  assert.ok(dns.structuredContent.records.NS.some((r) => r.startsWith("ns1.google.com")));
  await client.close();
});
