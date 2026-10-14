import assert from "node:assert/strict";
import test from "node:test";
import { buildServer, createContext } from "../src/server.mjs";
import { holidaysIn, resolveRegion, stateCode, ukSnapshotRows } from "../src/calendar.mjs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

test("official Scottish one-off holiday changes holiday, business-day and meeting answers", async (t) => {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const server = buildServer(createContext());
  const client = new Client({ name: "uk-calendar-check", version: "1" });
  t.after(async () => { await client.close(); await server.close(); });
  await server.connect(serverSide); await client.connect(clientSide);
  const read = async (name, args) => (await client.callTool({ name, arguments: args })).structuredContent;
  const holiday = await read("holidays", { where: "Scotland", date: "2026-06-15" });
  assert.equal(holiday.working_day, false);
  assert.ok(holiday.results.some((row) => row.name === "World Cup bank holiday"));
  const business = await read("business_days", { where: "Scotland", start: "2026-06-12", add: 1 });
  assert.equal(business.result, "2026-06-16");
  const meeting = await read("meeting_slots", { people: ["Edinburgh", "London"], date: "2026-06-15", days: 1, minutes: 60 });
  assert.deepEqual(meeting.slots, []);
  const england = await read("holidays", { where: "England", date: "2026-06-15" });
  assert.equal(england.working_day, true);
});

test("UK snapshots stay regional, preserve other observances and do not erase unpublished years", () => {
  assert.ok(ukSnapshotRows(resolveRegion("Scotland"), 2026).some((row) => row.date === "2026-06-15"));
  assert.ok(!ukSnapshotRows(resolveRegion("England"), 2026).some((row) => row.date === "2026-06-15"));
  assert.equal(ukSnapshotRows(resolveRegion("US"), 2026), undefined);
  assert.equal(ukSnapshotRows(resolveRegion("Scotland"), 2029), undefined);
  assert.ok(holidaysIn(resolveRegion("Scotland"), 2029, ["public"]).length > 0);
  assert.match(resolveRegion("GB").label, /England and Wales/);
  assert.equal(stateCode("GB", "Edinburgh"), "SCT");
  assert.equal(stateCode("GB", "Glasgow"), "SCT");
  assert.equal(stateCode("GB", "Belfast"), "NIR");
  assert.equal(stateCode("GB", "Cardiff"), "WLS");
});
