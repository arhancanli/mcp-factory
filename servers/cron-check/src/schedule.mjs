// src/schedule.mjs
//
// When an expression fires, in a time zone: the days that match, then the times within each day,
// turned into instants with the zone's rules. A time that daylight saving skips or repeats is
// flagged, because schedulers differ there (some run it once after the change, some not at all).
import { createRequire } from "node:module";
import { ToolError } from "./kit/index.mjs";
import { addDays, dateText, instantOf, localAt, timeText } from "./clock.mjs";
import { dayMatches } from "./cron.mjs";

const require = createRequire(import.meta.url);
const cronstrue = require("cronstrue");

const MAX_DAYS = 366 * 6;

/** A zone Intl accepts, or a clear error. */
export function zoneOf(raw) {
  const z = String(raw ?? "UTC").trim();
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: z }).resolvedOptions().timeZone;
  } catch {
    throw new ToolError("bad_timezone", `"${raw}" is not an IANA time zone (for example Europe/London, America/New_York, UTC).`);
  }
}

/** The next runs after an instant: [{local, utc, weekday, note?}]. Empty when it never fires within six years. */
export function nextRuns(c, zone, fromEpoch, count) {
  const place = { zone };
  const start = localAt(place, fromEpoch);
  const hours = [...c.hours].sort((a, b) => a - b);
  const minutes = [...c.minutes].sort((a, b) => a - b);
  const seconds = [...c.seconds].sort((a, b) => a - b);
  const out = [];
  let day = { year: start.year, month: start.month, day: start.day };
  for (let i = 0; i < MAX_DAYS && out.length < count; i++, day = addDays(day, 1)) {
    if (!dayMatches(c, day.year, day.month, day.day)) continue;
    for (const h of hours)
      for (const m of minutes)
        for (const s of seconds) {
          if (out.length >= count) return out;
          const r = instantOf(place, { ...day, hour: h, minute: m });
          const epoch = r.epoch + s * 1000;
          if (epoch <= fromEpoch) continue;
          const l = localAt(place, epoch);
          const iso = new Date(epoch).toISOString().replace(".000Z", "Z");
          out.push({
            local: `${dateText(l)} ${timeText(l)}${s ? `:${String(s).padStart(2, "0")}` : ""}`,
            weekday: l.weekday,
            utc: iso,
            note: r.status === "skipped" ? `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")} does not exist that day (clocks go forward); schedulers differ: some run at ${timeText(l)}, some skip it` : r.status === "repeated" ? `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")} happens twice that day (clocks go back); most schedulers run once` : undefined,
          });
        }
  }
  return out;
}

/** Plain English for an expression in its dialect. */
export function describe(c) {
  const text = c.dialect === "aws" ? c.source.replace(/^cron\((.*)\)$/i, "$1") : c.source;
  const quartzLike = c.dialect === "aws" || c.dialect === "quartz";
  // cronstrue reads 6 fields as seconds-first; AWS's six are minute-first with a year, so a 0 second is added.
  const input = c.dialect === "aws" ? `0 ${text}` : text;
  try {
    return cronstrue.toString(input, { use24HourTimeFormat: true, dayOfWeekStartIndexZero: !quartzLike, verbose: false });
  } catch {
    return undefined;
  }
}
