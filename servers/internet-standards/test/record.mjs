#!/usr/bin/env node
// node test/record.mjs: re-records test/fixtures/sources.json.gz through the real tools. The RFC
// index and the errata export are cut down to the entries the tests use (the kept bytes are the
// upstream's, unchanged); the port-number CSV to its header and the rows the tests query.
import { writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildServer, createContext } from "../src/server.mjs";
import { fixtureKey } from "./replay.mjs";
import { KEEP_RFCS, SCENARIOS } from "./scenarios.mjs";

const keep = new Set(KEEP_RFCS.map((n) => `RFC${String(n).padStart(4, "0")}`));

function slim(key, body) {
  if (key.endsWith("/rfc-index.xml")) {
    const head = body.slice(0, body.indexOf("<rfc-entry>"));
    const entries = [...body.matchAll(/<(bcp-entry|rfc-entry)>[\s\S]*?<\/\1>/g)].map((m) => m[0]).filter((e) => {
      const id = e.match(/<doc-id>([^<]+)<\/doc-id>/)?.[1];
      if (e.startsWith("<bcp-entry>")) return id === "BCP0014";
      const title = e.match(/<title>([^<]+)<\/title>/)?.[1] ?? "";
      return keep.has(id) || /\bHTTP\b/.test(title);
    });
    return `${head}${entries.join("\n")}\n</rfc-index>\n`;
  }
  if (key.endsWith("/errata.json")) {
    return JSON.stringify(JSON.parse(body).filter((e) => keep.has(String(e["doc-id"]).toUpperCase().replace(/^RFC0*/, "RFC").replace(/^RFC(\d{1,3})$/, (m, n) => `RFC${n.padStart(4, "0")}`)) || keep.has(e["doc-id"])));
  }
  if (key.includes("service-names-port-numbers")) {
    const lines = body.split("\n");
    return [lines[0], ...lines.slice(1).filter((l) => /,5432,|,443,|,80,/.test(l))].join("\n");
  }
  return body;
}

const recorded = {};
const recordingFetch = async (url, init) => {
  const res = await fetch(url, init);
  const body = await res.text();
  const key = fixtureKey(url);
  recorded[key] = { status: res.status, body: slim(key, body) };
  return new Response(body, { status: res.status, headers: res.headers });
};
const server = buildServer(createContext({ fetchImpl: recordingFetch }));
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
