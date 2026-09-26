// Replays recorded source responses for the golden tests.
import { readFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildServer, createContext } from "../src/server.mjs";

export function fixtureKey(url) {
  const u = new URL(url);
  u.searchParams.delete("mailto");
  u.searchParams.delete("api_key");
  return `${u.host}${u.pathname}${u.search}`;
}

export function replayFetch(fixtures = JSON.parse(readFileSync(new URL("./fixtures/sources.json", import.meta.url), "utf8"))) {
  const calls = [];
  const impl = async (url) => {
    const key = fixtureKey(url);
    calls.push(key);
    const hit = fixtures[key];
    if (!hit) throw new Error(`no fixture for ${key}`);
    return new Response(typeof hit.body === "string" ? hit.body : JSON.stringify(hit.body), { status: hit.status });
  };
  return { impl, calls };
}

export async function connect(fetchImpl = replayFetch().impl, env = {}) {
  const server = buildServer(createContext({ fetchImpl, env }));
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "golden", version: "0" });
  await Promise.all([server.connect(a), client.connect(b)]);
  // Like a real client: once the tools are listed, every result is validated against its schema.
  await client.listTools();
  return client;
}

export async function call(client, name, args) {
  const res = await client.callTool({ name, arguments: args });
  return { res, data: res.structuredContent ?? JSON.parse(res.content[0].text) };
}
