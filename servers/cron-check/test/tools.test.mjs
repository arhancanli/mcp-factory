// Golden tests: the three tools over a real MCP client at 2026-09-26 12:00 UTC.
import assert from "node:assert/strict";
import test from "node:test";
import { call, connect } from "./harness.mjs";
import { EXPRESSIONS } from "./scenarios.mjs";

test("explain_cron: descriptions, dialects, gotchas, never-firing schedules and clear errors", async () => {
  const client = await connect();
  const { data } = await call(client, "explain_cron", { expressions: EXPRESSIONS });
  const by = Object.fromEntries(data.results.map((r) => [r.expression, r]));
  assert.deepEqual([by["0 9 * * 1-5"].description, by["0 9 * * 1-5"].next_utc[0]], ["At 09:00, Monday through Friday", "2026-09-28T09:00:00Z"], "Saturday the 26th: next is Monday");
  assert.match(by["*/7 * * * *"].warnings[0], /restarts at 0 each hour/);
  assert.match(by["0 0 1 * 1"].warnings[0], /OR day-of-week/);
  assert.deepEqual(by["0 0 1 * 1"].next_utc, ["2026-09-28T00:00:00Z", "2026-10-01T00:00:00Z", "2026-10-05T00:00:00Z"], "Mondays and the 1st");
  assert.deepEqual([by["0 0 30 2 *"].valid, /never fires/.test(by["0 0 30 2 *"].error)], [false, true]);
  assert.equal(by["cron(0 12 ? * MON-FRI *)"].dialect, "aws");
  assert.equal(by["0 0/5 14 * * ?"].dialect, "quartz");
  assert.match(by["0 10 ? * 6#3"].error, /unix cron does not have/, "Quartz syntax in a 5-field expression is caught");
  assert.equal(by["@daily"].description, "At 00:00");
  assert.match(by["61 * * * *"].error, /outside 0-59/);
  assert.equal(by["0 0 L * *"].valid, false);
});

test("next_runs: local times in a zone, with the daylight-saving gap flagged", async () => {
  const client = await connect();
  const { data } = await call(client, "next_runs", { expression: "30 2 * * *", timezone: "America/New_York", count: 3, from: "2026-03-07T00:00:00Z" });
  assert.deepEqual(data.runs.map((r) => r.local), ["2026-03-07 02:30", "2026-03-08 03:30", "2026-03-09 02:30"]);
  assert.match(data.runs[1].note, /does not exist that day/);
  const quartz = await call(client, "next_runs", { expression: "0 15 10 ? * 6L", dialect: "quartz", count: 2 });
  assert.deepEqual(quartz.data.runs.map((r) => r.local), ["2026-10-30 10:15", "2026-11-27 10:15"], "the last Friday of each month (Quartz: 6 is Friday); September's was the 25th, already past");
  const bad = await call(client, "next_runs", { expression: "0 9 * * *", timezone: "Mars/Olympus" });
  assert.equal(bad.data.error.code, "bad_timezone");
});

test("convert_cron: weekday names across dialects; what a target cannot express is refused with the reason", async () => {
  const client = await connect();
  assert.equal((await call(client, "convert_cron", { expression: "0 9 * * 1-5", to: "aws" })).data.expression, "cron(0 9 ? * MON-FRI *)");
  assert.equal((await call(client, "convert_cron", { expression: "0 9 * * 1-5", to: "quartz" })).data.expression, "0 0 9 ? * MON-FRI");
  assert.equal((await call(client, "convert_cron", { expression: "cron(15 10 ? * 2 *)", to: "unix" })).data.expression, "15 10 * * MON", "AWS's 2 is Monday");
  const or = await call(client, "convert_cron", { expression: "0 0 1 * 1", to: "aws" });
  assert.match(or.data.error.message, /two schedules/);
  const secs = await call(client, "convert_cron", { expression: "30 0 12 * * ?", to: "github" });
  assert.match(secs.data.error.message, /at most once a minute/);
});
