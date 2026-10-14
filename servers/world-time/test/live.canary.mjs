// Weekly canary (.github/workflows/canary.yml): the tools on the real clock, with the time zone
// database of the Node that runs them. The server is offline, so this catches what ages: the
// clock itself, and a tz database too old to know this year's daylight-saving changes.
import assert from "node:assert/strict";
import test, { after } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildServer } from "../src/server.mjs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const snapshot = require("../src/data/uk-bank-holidays.json");

const client = new Client({ name: "canary", version: "0" });
const [a, b] = InMemoryTransport.createLinkedPair();
await Promise.all([buildServer().connect(a), client.connect(b)]);
await client.listTools();
after(async () => { await client.close(); });

test("live: today, this year's DST change in New York, this year's holidays", async () => {
  const today = new Date().toISOString().slice(0, 10);
  const now = await client.callTool({ name: "world_time", arguments: { places: ["UTC"] } });
  assert.equal(now.structuredContent.results[0].date, today);
  const year = Number(today.slice(0, 4));
  // US daylight time starts on the second Sunday of March at 02:00: 02:30 that day never happens.
  const march = new Date(Date.UTC(year, 2, 1));
  const secondSunday = 1 + ((7 - march.getUTCDay()) % 7) + 7;
  const gap = await client.callTool({ name: "world_time", arguments: { places: ["UTC"], time: `${year}-03-${String(secondSunday).padStart(2, "0")} 02:30`, from: "America/New_York" } });
  assert.equal(gap.structuredContent.status, "skipped");
  const h = await client.callTool({ name: "holidays", arguments: { where: "US", year } });
  assert.ok(h.structuredContent.results.some((x) => x.date === `${year}-07-04`));
});

test("live: reviewed UK regional calendars match the published government dates", async () => {
  const response = await fetch(snapshot.source, { redirect: "error", signal: AbortSignal.timeout(10_000) });
  assert.equal(response.ok, true, "Government calendar lookup failed; upstream state is unknown.");
  const reader = response.body.getReader();
  const chunks = [];
  let bytes = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > 1024 * 1024) throw new Error("Government calendar exceeds its size limit.");
      chunks.push(value);
    }
  } finally { await reader.cancel(); }
  let published;
  try { published = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new Error("Government calendar is not valid JSON."); }
  const year = new Date().getUTCFullYear();
  for (const [division, where] of [["england-and-wales", "England"], ["scotland", "Scotland"], ["northern-ireland", "Northern Ireland"]]) {
    assert.ok(snapshot.divisions[division].years.includes(year), "Refresh the reviewed snapshot for the current year.");
    for (const checkedYear of snapshot.divisions[division].years.filter((value) => value >= year)) {
      const expected = published[division].events.filter((event) => event.date.startsWith(`${checkedYear}-`)).map((event) => `${event.date}|${event.title}|${/substitute day/i.test(event.notes ?? "")}`).sort();
      assert.ok(expected.length > 0, "Government calendar no longer publishes this reviewed year.");
      const result = await client.callTool({ name: "holidays", arguments: { where, year: checkedYear } });
      const observed = result.structuredContent.results.map((event) => `${event.date}|${event.name}|${Boolean(event.substitute)}`).sort();
      assert.deepEqual(observed, expected, `${division} ${checkedYear}: refresh changed dates before release.`);
    }
  }
});
