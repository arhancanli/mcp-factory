#!/usr/bin/env node
// node test/record.mjs: re-records test/fixtures/sources.json from the live sources, through the
// real tools. Keys are path plus query (without mailto or api_key), since this server's requests
// differ only in their query strings.
import { writeFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildServer, createContext } from "../src/server.mjs";
import { fixtureKey } from "./replay.mjs";
import { SCENARIOS } from "./scenarios.mjs";

const recorded = {};
const recordingFetch = async (url, init) => {
  const res = await fetch(url, init);
  const body = await res.text();
  recorded[fixtureKey(url)] = { status: res.status, body: body.trimStart().startsWith("{") ? JSON.parse(body) : body };
  return new Response(body, { status: res.status, headers: res.headers });
};
const server = buildServer(createContext({ fetchImpl: recordingFetch, env: {} }));
const [a, b] = InMemoryTransport.createLinkedPair();
const client = new Client({ name: "record", version: "0" });
await Promise.all([server.connect(a), client.connect(b)]);
for (const s of SCENARIOS) {
  const res = await client.callTool({ name: s.tool, arguments: s.args });
  if (Boolean(res.isError) !== Boolean(s.expectError)) console.error(`unexpected result for ${s.label}: ${res.content[0].text.slice(0, 200)}`);
}
// An outage recorded here would become what the golden tests expect: refuse to write it.
const refused = Object.entries(recorded).filter(([, v]) => [402, 403, 429].includes(v.status) || v.status >= 500);
if (refused.length) {
  console.error(`not written: ${refused.length} refused responses (${refused.map(([k, v]) => `${v.status} ${k.slice(0, 60)}`).slice(0, 3).join("; ")}). Record again when the sources answer.`);
  process.exit(1);
}
const sorted = Object.fromEntries(Object.entries(recorded).sort(([x], [y]) => x.localeCompare(y)));
writeFileSync(new URL("./fixtures/sources.json", import.meta.url), `${JSON.stringify(sorted)}\n`);
console.log(`recorded ${Object.keys(sorted).length} responses, ${JSON.stringify(sorted).length} bytes`);
