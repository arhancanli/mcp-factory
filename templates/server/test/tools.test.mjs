// Golden tests: each tool against recorded upstream responses in test/fixtures, through a real MCP
// client, so the result a model sees is what is asserted. No test here touches the network.
import assert from "node:assert/strict";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildServer, createContext } from "../src/server.mjs";

function fixtureFetch(routes) {
  return async (url) => {
    const hit = routes[new URL(url).pathname];
    if (!hit) return new Response("not found", { status: 404 });
    return new Response(JSON.stringify(hit), { status: 200, headers: { "content-type": "application/json" } });
  };
}

async function connect(routes) {
  const server = buildServer(createContext({ fetchImpl: fixtureFetch(routes) }));
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "golden", version: "0" });
  await Promise.all([server.connect(a), client.connect(b)]);
  // Like a real client: once the tools are listed, every result is validated against its schema.
  await client.listTools();
  return client;
}

test("example_lookup returns the item name", async () => {
  const client = await connect({ "/items/42": { name: "Answer" } });
  const res = await client.callTool({ name: "example_lookup", arguments: { id: "42" } });
  assert.deepEqual(res.structuredContent, { id: "42", name: "Answer" });
});

test("example_lookup reports a missing item as not_found", async () => {
  const client = await connect({});
  const res = await client.callTool({ name: "example_lookup", arguments: { id: "nope" } });
  assert.equal(res.isError, true);
  assert.equal(JSON.parse(res.content[0].text).error.code, "not_found");
});
