// Replays recorded responses (test/fixtures/sources.json.gz) for the golden tests: Docker Hub's tag
// API, manifests and anonymous tokens from GHCR, Quay, MCR, ECR Public and registry.k8s.io, and
// endoflife.date. Headers the registries answer with (digest, content type, auth challenge) are
// replayed too. The clock is fixed at the recording date.
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildServer, createContext } from "../src/server.mjs";

// Token requests carry a per-minute parameter (src/registry.mjs); fixtures ignore it.
export const fixtureKey = (url, init = {}) => {
  const u = new URL(url);
  u.searchParams.delete("t");
  return `${init.method ?? "GET"} ${u.host}${u.pathname}${u.search}`;
};

export const KEPT_HEADERS = ["content-type", "docker-content-digest", "www-authenticate"];

export const loadFixtures = () => JSON.parse(gunzipSync(readFileSync(new URL("./fixtures/sources.json.gz", import.meta.url))).toString("utf8"));

export function replayFetch(fixtures = loadFixtures()) {
  const calls = [];
  const impl = async (url, init) => {
    const key = fixtureKey(url, init);
    calls.push(key);
    const hit = fixtures[key];
    if (!hit) throw new Error(`no fixture for ${key}`);
    return new Response(hit.status === 204 || hit.status === 304 ? null : hit.body, { status: hit.status, headers: hit.headers ?? {} });
  };
  return { impl, calls };
}

export function recordedAt() {
  try {
    return Date.parse(loadFixtures()["@recorded_at"].body);
  } catch {
    return Date.now();
  }
}

export async function connect(fetchImpl = replayFetch().impl) {
  const at = recordedAt();
  const server = buildServer(createContext({ fetchImpl, now: () => at }));
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
