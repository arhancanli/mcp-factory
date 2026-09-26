#!/usr/bin/env node
// node test/record.mjs: re-records test/fixtures/sources.json.gz through the real tools. Search
// requests are POSTs, so they are keyed by URL plus request body.
import { writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildServer, createContext } from "../src/server.mjs";
import { requestKey } from "./replay.mjs";
import { NOW, SCENARIOS } from "./scenarios.mjs";

const recorded = {};
const recordingFetch = async (url, init) => {
  const res = await fetch(url, init);
  let body = await res.text();
  // Keep the fields the server reads: ids, dates, clouds, platform, geometry and asset links.
  if (res.ok && body.startsWith("{")) {
    const d = JSON.parse(body);
    const slim = (f) => ({ id: f.id, bbox: f.bbox, geometry: f.geometry, properties: Object.fromEntries(Object.entries(f.properties ?? {}).filter(([k]) => /datetime|cloud|platform|proj:(epsg|code)/.test(k))), assets: Object.fromEntries(Object.entries(f.assets ?? {}).map(([k, a]) => [k, { href: a.href, title: a.title, type: a.type, gsd: a.gsd, "eo:bands": a["eo:bands"], "raster:bands": a["raster:bands"]?.slice(0, 1) }])) });
    if (Array.isArray(d.features)) body = JSON.stringify({ numberMatched: d.numberMatched, features: d.features.map(slim) });
    else if (d.type === "Feature") body = JSON.stringify(slim(d));
  }
  recorded[requestKey(url, init)] = { status: res.status, body };
  return new Response(body, { status: res.status, headers: res.headers });
};
const server = buildServer(createContext({ fetchImpl: recordingFetch, now: () => NOW }));
const [a, b] = InMemoryTransport.createLinkedPair();
const client = new Client({ name: "record", version: "0" });
await Promise.all([server.connect(a), client.connect(b)]);
for (const s of SCENARIOS) {
  const res = await client.callTool({ name: s.tool, arguments: s.args });
  if (Boolean(res.isError) !== Boolean(s.expectError)) console.error(`unexpected result for ${s.label}: ${res.content[0].text.slice(0, 200)}`);
}
const sorted = Object.fromEntries(Object.entries(recorded).sort(([x], [y]) => x.localeCompare(y)));
const gz = gzipSync(JSON.stringify(sorted), { level: 9 });
writeFileSync(new URL("./fixtures/sources.json.gz", import.meta.url), gz);
console.log(`recorded ${Object.keys(sorted).length} responses, ${gz.length} bytes compressed`);
