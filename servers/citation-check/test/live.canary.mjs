// Weekly canary (.github/workflows/canary.yml): the tools against the live sources. Asserts only
// facts that should not change: a retraction on record, an invented DOI, an arXiv paper's author.
import assert from "node:assert/strict";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildServer } from "../src/server.mjs";

const client = new Client({ name: "canary", version: "0" });
const [a, b] = InMemoryTransport.createLinkedPair();
await Promise.all([buildServer().connect(a), client.connect(b)]);

test("live: known facts still come back from the sources", { timeout: 90_000 }, async () => {
  const ret = await client.callTool({ name: "check_retractions", arguments: { dois: ["10.1016/S0140-6736(97)11096-0", "10.1038/nature12373"] } });
  const byDoi = Object.fromEntries(ret.structuredContent.results.map((r) => [r.doi, r.status]));
  assert.equal(byDoi["10.1016/s0140-6736(97)11096-0"], "retracted");
  assert.equal(byDoi["10.1038/nature12373"], "none");
  const arxiv = await client.callTool({ name: "lookup_work", arguments: { id: "arXiv:1706.03762" } });
  assert.match(arxiv.structuredContent.authors, /^Ashish Vaswani/);
  const fake = await client.callTool({ name: "lookup_work", arguments: { id: "10.9999/this-doi-does-not-exist-xyz" } });
  assert.equal(JSON.parse(fake.content[0].text).error.code, "doi_not_registered");
  await client.close();
});
