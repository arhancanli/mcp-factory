// src/convert.mjs
//
// One schedule written for another scheduler. Days of the week are written as names (MON-FRI,
// FRI#3), which every dialect reads the same way, so the Sunday-is-0-or-1 difference cannot bite.
// What a dialect cannot express is refused with the reason: seconds in Unix cron, L/W/# in Unix
// cron, a year outside AWS and Quartz, and Unix's "day-of-month OR day-of-week" in dialects that
// need ? in one day field (it takes two schedules there).
import { ToolError } from "./kit/index.mjs";

const NAMES = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const UNIX_LIKE = new Set(["unix", "github", "kubernetes"]);

/** A set of weekdays as names with runs compressed: {1,2,3,4,5} -> MON-FRI. */
function dayList(set) {
  const days = [...set].sort((a, b) => a - b);
  const parts = [];
  for (let i = 0; i < days.length; ) {
    let j = i;
    while (j + 1 < days.length && days[j + 1] === days[j] + 1) j++;
    parts.push(j - i >= 2 ? `${NAMES[days[i]]}-${NAMES[days[j]]}` : days.slice(i, j + 1).map((d) => NAMES[d]).join(","));
    i = j + 1;
  }
  return parts.join(",");
}

function dowText(dow) {
  if (dow.any) return "*";
  return [dow.values.size ? dayList(dow.values) : null, ...dow.nth.map((x) => `${NAMES[x.day]}#${x.n}`), ...dow.lastOf.map((d) => `${NAMES[d]}L`)].filter(Boolean).join(",");
}

export function convertCron(c, target) {
  if (c.dialect === target || (UNIX_LIKE.has(c.dialect) && UNIX_LIKE.has(target))) {
    const same = c.raw;
    const expr = UNIX_LIKE.has(target) ? [same.min, same.hour, same.dom, same.mon, same.dow].join(" ") : c.source;
    return { expression: expr };
  }
  const secondsUsed = !(c.seconds.size === 1 && c.seconds.has(0));
  const yearUsed = c.raw.year !== undefined && c.raw.year !== "*";
  const special = !c.dom.any && (c.dom.last || c.dom.lastWeekday || c.dom.nearestWeekday.length);
  const specialDow = !c.dow.any && (c.dow.nth.length || c.dow.lastOf.length);
  const domRestricted = !c.dom.any;
  const dowRestricted = !c.dow.any;
  const dom = c.dom.question ? "*" : c.raw.dom;
  const dow = dowText(c.dow);
  if (UNIX_LIKE.has(target)) {
    if (secondsUsed) throw new ToolError("not_expressible", `${c.source} runs at second ${[...c.seconds].join(",")}; ${target} cron runs at most once a minute, on the minute.`);
    if (yearUsed) throw new ToolError("not_expressible", `${target} cron has no year field; the schedule would repeat every year.`);
    if (special || specialDow) throw new ToolError("not_expressible", `${target} cron has no L, W or # (last day, nearest weekday, nth weekday); run daily and check the date in the job instead.`);
    // Quartz and AWS need both day fields to match; Unix treats two restricted fields as OR.
    if (domRestricted && dowRestricted) throw new ToolError("not_expressible", `This matches days that fit both the day of month (${c.raw.dom}) and the weekday (${c.raw.dow}); ${target} cron would run on either. Run on ${c.raw.dom} and check the weekday in the job.`);
    return { expression: [c.raw.min, c.raw.hour, dom, c.raw.mon, dow].join(" ") };
  }
  if (domRestricted && dowRestricted && UNIX_LIKE.has(c.dialect)) {
    throw new ToolError("not_expressible", `In ${c.dialect} cron this runs on day ${c.raw.dom} OR on ${dow}; ${target} needs ? in one day field, so it takes two schedules: one with day-of-month ${c.raw.dom} and day-of-week ?, one with day-of-month ? and day-of-week ${dow}.`);
  }
  const d = dowRestricted ? "?" : dom === "*" ? "?" : dom;
  const w = dowRestricted ? dow : d === "?" ? "*" : "?";
  const sec = [...c.seconds].length === 60 ? "*" : c.raw.sec ?? "0";
  if (target === "aws") {
    if (secondsUsed) throw new ToolError("not_expressible", "EventBridge cron has no seconds field; it runs at most once a minute.");
    return { expression: `cron(${[c.raw.min, c.raw.hour, dowRestricted ? "?" : d, c.raw.mon, w, c.raw.year ?? "*"].join(" ")})` };
  }
  if (target === "quartz") return { expression: [UNIX_LIKE.has(c.dialect) ? "0" : sec, c.raw.min, c.raw.hour, dowRestricted ? "?" : d, c.raw.mon, w, ...(yearUsed ? [c.raw.year] : [])].join(" ") };
  if (target === "spring") {
    if (yearUsed) throw new ToolError("not_expressible", "Spring cron has no year field.");
    return { expression: [UNIX_LIKE.has(c.dialect) ? "0" : sec, c.raw.min, c.raw.hour, dowRestricted ? "?" : d, c.raw.mon, w].join(" ") };
  }
  throw new ToolError("bad_dialect", `Unknown target ${target}.`);
}
