// The rules without the MCP layer: parsing per dialect, day matching (L, W, #), conversion.
import assert from "node:assert/strict";
import test from "node:test";
import { convertCron } from "../src/convert.mjs";
import { dayMatches, detectDialect, parseCron } from "../src/cron.mjs";

test("dialects are detected from shape; ? decides AWS against Quartz", () => {
  assert.equal(detectDialect("0 9 * * *"), "unix");
  assert.equal(detectDialect("cron(0 9 * * ? *)"), "aws");
  assert.equal(detectDialect("0 9 ? * MON *"), "aws");
  assert.equal(detectDialect("0 0 9 ? * MON"), "quartz");
  assert.equal(detectDialect("0 0 9 * * *"), "spring");
  assert.equal(detectDialect("0 0 9 ? * MON 2027"), "quartz");
  assert.equal(detectDialect("@weekly"), "kubernetes");
});

test("day matching: Unix OR rule, Quartz AND via ?, L, LW, nW, nth and last weekday", () => {
  const unix = parseCron("0 0 13 * 5");
  assert.ok(dayMatches(unix, 2026, 11, 13) && dayMatches(unix, 2026, 11, 6), "Friday the 13th and any Friday");
  const quartz = parseCron("0 0 0 13 * ?", "quartz");
  assert.ok(dayMatches(quartz, 2026, 11, 13) && !dayMatches(quartz, 2026, 11, 6));
  const last = parseCron("0 0 0 L * ?", "quartz");
  assert.ok(dayMatches(last, 2028, 2, 29) && !dayMatches(last, 2028, 2, 28), "leap-year February");
  const lw = parseCron("0 0 0 LW * ?", "quartz");
  assert.ok(dayMatches(lw, 2026, 5, 29), "May 31 2026 is a Sunday: the last weekday is Friday the 29th");
  const w = parseCron("0 0 0 1W * ?", "quartz");
  assert.ok(dayMatches(w, 2026, 8, 3), "Aug 1 2026 is a Saturday: nearest weekday not leaving the month is Monday the 3rd");
  const nth = parseCron("0 0 0 ? * 2#1", "quartz");
  assert.ok(dayMatches(nth, 2026, 9, 7) && !dayMatches(nth, 2026, 9, 14), "first Monday (Quartz 2 = Monday)");
  const lastFri = parseCron("0 0 0 ? * 6L", "quartz");
  assert.ok(dayMatches(lastFri, 2026, 10, 30) && !dayMatches(lastFri, 2026, 10, 23));
  assert.throws(() => parseCron("0 0 0 1 * MON", "quartz"), /needs \?/);
  assert.throws(() => parseCron("0 0 ? * ? *", "aws"), /only one/);
});

test("conversion: seconds, years and special characters that a target lacks are refused", () => {
  assert.equal(convertCron(parseCron("0 30 6 ? * MON-FRI 2027", "quartz"), "aws").expression, "cron(30 6 ? * MON-FRI 2027)");
  assert.throws(() => convertCron(parseCron("0 0 0 ? * 6L", "quartz"), "unix"), /no L, W or #/);
  assert.throws(() => convertCron(parseCron("0 0 0 1 1 ? 2027", "quartz"), "kubernetes"), /no year field/);
  assert.equal(convertCron(parseCron("0 12 * * 0,6"), "spring").expression, "0 0 12 ? * SUN,SAT");
});
