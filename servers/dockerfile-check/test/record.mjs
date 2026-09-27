#!/usr/bin/env node
// node test/record.mjs: re-records test/fixtures/sources.json.gz through the real tools, with the
// headers the registries answer with, and the recording time (the replayed clock).
import { writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildServer, createContext } from "../src/server.mjs";
import { fixtureKey, KEPT_HEADERS } from "./replay.mjs";
import { SCENARIOS } from "./scenarios.mjs";

const recorded = { "@recorded_at": { status: 200, body: new Date().toISOString() } };
const recordingFetch = async (url, init) => {
  const res = await fetch(url, init);
  const body = await res.text();
  const headers = Object.fromEntries(KEPT_HEADERS.map((h) => [h, res.headers.get(h)]).filter(([, v]) => v));
  recorded[fixtureKey(url, init)] = { status: res.status, body, headers };
  return new Response(res.status === 204 || res.status === 304 ? null : body, { status: res.status, headers: res.headers });
};
const server = buildServer(createContext({ fetchImpl: recordingFetch }));
const [a, b] = InMemoryTransport.createLinkedPair();
const client = new Client({ name: "record", version: "0" });
await Promise.all([server.connect(a), client.connect(b)]);
for (const s of SCENARIOS) {
  const res = await client.callTool({ name: s.tool, arguments: s.args });
  if (Boolean(res.isError) !== Boolean(s.expectError)) console.error(`unexpected result for ${s.label}: ${res.content[0].text.slice(0, 200)}`);
}
// An outage recorded here would become what the golden tests expect: refuse to write it.
const refused = Object.entries(recorded).filter(([, v]) => v.status === 429 || v.status >= 500);
if (refused.length) {
  console.error(`not written: ${refused.length} refused responses (${refused.map(([k, v]) => `${v.status} ${k.slice(0, 80)}`).slice(0, 3).join("; ")}).`);
  process.exit(1);
}
const sorted = Object.fromEntries(Object.entries(recorded).sort(([x], [y]) => x.localeCompare(y)));
const gz = gzipSync(JSON.stringify(sorted), { level: 9 });
writeFileSync(new URL("./fixtures/sources.json.gz", import.meta.url), gz);
console.log(`recorded ${Object.keys(sorted).length - 1} responses, ${gz.length} bytes compressed`);
