// src/cron.mjs
//
// Cron expressions in the dialects agents meet, parsed into sets of allowed values:
//   unix        minute hour day-of-month month day-of-week (Sunday 0 or 7); when both day fields
//               are restricted, a day matches either one (Vixie cron's rule)
//   github      unix syntax, run in UTC, at most every 5 minutes
//   kubernetes  unix syntax plus @yearly, @monthly, @weekly, @daily, @hourly
//   aws         EventBridge cron(minute hour day-of-month month day-of-week year): Sunday is 1,
//               one day field must be ?, years allowed
//   quartz      second minute hour day-of-month month day-of-week [year]: Sunday is 1, one day
//               field must be ?
//   spring      second minute hour day-of-month month day-of-week: Sunday is 0 or 7
// L (last), W (nearest weekday), # (nth weekday) and ? are understood where the dialect has them.
import { ToolError } from "./kit/index.mjs";

export const DIALECTS = ["unix", "github", "kubernetes", "aws", "quartz", "spring"];
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const MACROS = { "@yearly": "0 0 1 1 *", "@annually": "0 0 1 1 *", "@monthly": "0 0 1 * *", "@weekly": "0 0 * * 0", "@daily": "0 0 * * *", "@midnight": "0 0 * * *", "@hourly": "0 * * * *" };
const sundayIsOne = (d) => d === "aws" || d === "quartz";

/** The dialect an expression is written in, when not given. */
export function detectDialect(raw) {
  const s = String(raw).trim();
  if (/^cron\(/i.test(s)) return "aws";
  if (s.startsWith("@")) return "kubernetes";
  const n = s.split(/\s+/).length;
  if (n === 5) return "unix";
  if (n === 7) return "quartz";
  if (n === 6) {
    // AWS puts ? in the day-of-month or day-of-week field (3rd or 5th); Quartz, with seconds first, in the 4th or 6th.
    const q = s.split(/\s+/).indexOf("?");
    return q === 2 || q === 4 ? "aws" : q === 3 || q === 5 ? "quartz" : "spring";
  }
  return "unix";
}

function numberOf(token, names, offset = 0) {
  const up = token.toUpperCase();
  const i = names ? names.indexOf(up) : -1;
  if (i >= 0) return i + offset;
  if (!/^\d+$/.test(token)) return NaN;
  return Number(token);
}

// A numeric field: "*", "a", "a-b", steps ("*" or a start or range, then "/" and the step), lists;
// names for months and days.
function parseSet(text, lo, hi, what, names, nameOffset = 0) {
  const out = new Set();
  for (const part of text.split(",")) {
    const [range, stepText] = part.split("/");
    const step = stepText === undefined ? 1 : Number(stepText);
    if (!(step >= 1) || !Number.isInteger(step)) throw new ToolError("bad_cron", `${what}: "${part}" has a step that is not a whole number above 0.`);
    let a;
    let b;
    if (range === "*" || range === "?") [a, b] = [lo, hi];
    else if (range.includes("-")) {
      const [x, y] = range.split("-");
      [a, b] = [numberOf(x, names, nameOffset), numberOf(y, names, nameOffset)];
    } else {
      a = numberOf(range, names, nameOffset);
      b = stepText === undefined ? a : hi;
    }
    if (Number.isNaN(a) || Number.isNaN(b)) throw new ToolError("bad_cron", `${what}: "${part}" is not a number${names ? " or name" : ""}.`);
    if (a < lo || b > hi || a > b) throw new ToolError("bad_cron", `${what}: "${part}" is outside ${lo}-${hi}${a > b ? " or runs backwards" : ""}.`);
    for (let v = a; v <= b; v += step) out.add(v);
  }
  return out;
}

/** Day-of-month: numbers, or L, LW, L-n, nW, ?. */
function parseDom(text, what) {
  if (text === "?") return { any: true, question: true };
  if (text === "*") return { any: true };
  const out = { values: new Set(), last: false, lastWeekday: false, lastOffset: 0, nearestWeekday: [] };
  for (const part of text.split(",")) {
    const u = part.toUpperCase();
    if (u === "L") out.last = true;
    else if (u === "LW") out.lastWeekday = true;
    else if (/^L-\d+$/.test(u)) {
      out.last = true;
      out.lastOffset = Number(u.slice(2));
    } else if (/^\d+W$/.test(u)) out.nearestWeekday.push(Number(u.slice(0, -1)));
    else for (const v of parseSet(part, 1, 31, what)) out.values.add(v);
  }
  return out;
}

/** Day-of-week, normalised to 0 = Sunday ... 6 = Saturday: numbers, names, dL (last), d#n (nth). */
function parseDow(text, dialect, what) {
  if (text === "?") return { any: true, question: true };
  if (text === "*") return { any: true };
  const one = sundayIsOne(dialect);
  const norm = (v) => (one ? v - 1 : v % 7);
  const out = { values: new Set(), nth: [], lastOf: [] };
  for (const part of text.split(",")) {
    const u = part.toUpperCase();
    const nth = u.match(/^(\w+)#([1-5])$/);
    const last = u.match(/^(\w+)L$/);
    if (nth) out.nth.push({ day: norm(numberOf(nth[1], DAYS, one ? 1 : 0)), n: Number(nth[2]) });
    else if (last) out.lastOf.push(norm(numberOf(last[1], DAYS, one ? 1 : 0)));
    else for (const v of parseSet(part, one ? 1 : 0, 7, what, DAYS, one ? 1 : 0)) out.values.add(norm(v));
  }
  if ([...out.nth.map((x) => x.day), ...out.lastOf].some((d) => !(d >= 0 && d <= 6))) throw new ToolError("bad_cron", `${what}: "${text}" names a day that does not exist.`);
  return out;
}

/**
 * @returns {{dialect, source, seconds: Set, minutes: Set, hours: Set, dom, months: Set, dow, years?: Set}}
 */
export function parseCron(raw, dialectIn) {
  let text = String(raw ?? "").trim();
  const dialect = dialectIn ?? detectDialect(text);
  if (!DIALECTS.includes(dialect)) throw new ToolError("bad_dialect", `Unknown dialect "${dialectIn}". Use ${DIALECTS.join(", ")}.`);
  if (dialect === "aws") text = text.replace(/^cron\((.*)\)$/i, "$1").trim();
  if (text.startsWith("@")) {
    if (text === "@reboot") throw new ToolError("no_schedule", "@reboot runs once when the machine starts; it has no schedule.");
    if (!MACROS[text.toLowerCase()]) throw new ToolError("bad_cron", `${text} is not a cron macro (@yearly, @monthly, @weekly, @daily, @hourly).`);
    if (dialect !== "unix" && dialect !== "kubernetes") throw new ToolError("bad_cron", `${dialect} does not accept ${text}.`);
    text = MACROS[text.toLowerCase()];
  }
  const f = text.split(/\s+/);
  const shapes = { unix: [5], github: [5], kubernetes: [5], aws: [6], quartz: [6, 7], spring: [6] };
  if (!shapes[dialect].includes(f.length)) {
    const want = { unix: "5 fields: minute hour day month weekday", github: "5 fields: minute hour day month weekday", kubernetes: "5 fields: minute hour day month weekday", aws: "6 fields: minute hour day month weekday year", quartz: "6 or 7 fields: second minute hour day month weekday [year]", spring: "6 fields: second minute hour day month weekday" }[dialect];
    throw new ToolError("bad_cron", `"${raw}" has ${f.length} fields; ${dialect} cron has ${want}.`);
  }
  // Unix cron has none of Quartz's ? L W # (Kubernetes' parser reads ? as *); accepting them would hide a dialect mix-up.
  if (dialect === "unix" || dialect === "github" || dialect === "kubernetes") {
    const bad = f.slice(2).find((x) => /[LW#]/i.test(x.replace(/[A-Z]{3}/gi, "")) || (dialect !== "kubernetes" && x.includes("?")));
    if (bad) throw new ToolError("bad_cron", `"${bad}" uses ${bad.includes("?") ? "?" : "L, W or #"}, which ${dialect} cron does not have; those belong to Quartz and AWS cron (pass dialect: "quartz" or "aws").`);
  }
  const withSeconds = dialect === "quartz" || dialect === "spring";
  const [sec, min, hour, dom, mon, dow, year] = withSeconds ? f : ["0", ...f];
  const parsed = {
    dialect,
    source: String(raw).trim(),
    seconds: parseSet(sec, 0, 59, "seconds"),
    minutes: parseSet(min, 0, 59, "minute"),
    hours: parseSet(hour, 0, 23, "hour"),
    dom: parseDom(dom, "day of month"),
    months: parseSet(mon, 1, 12, "month", MONTHS, 1),
    dow: parseDow(dow, dialect, "day of week"),
    years: year !== undefined ? parseSet(year, 1970, 2199, "year") : undefined,
    raw: { sec, min, hour, dom, mon, dow, year },
  };
  if ((dialect === "aws" || dialect === "quartz") && !(parsed.dom.question || parsed.dow.question)) throw new ToolError("bad_cron", `${dialect} needs ? in either the day-of-month or the day-of-week field (for example "0 12 ? * MON-FRI${dialect === "aws" ? " *" : ""}").`);
  if ((dialect === "aws" || dialect === "quartz") && parsed.dom.question && parsed.dow.question) throw new ToolError("bad_cron", `${dialect} allows ? in only one of the two day fields.`);
  return parsed;
}

const daysIn = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const weekday = (y, m, d) => new Date(Date.UTC(y, m - 1, d)).getUTCDay();

function nearestWeekday(y, m, target) {
  const last = daysIn(y, m);
  const d = Math.min(target, last);
  const w = weekday(y, m, d);
  if (w >= 1 && w <= 5) return d;
  if (w === 6) return d === 1 ? 3 : d - 1; // Saturday: Friday, unless that leaves the month
  return d === last ? d - 2 : d + 1; // Sunday: Monday, unless that leaves the month
}

/** Whether a calendar day matches the day, month and year fields. */
export function dayMatches(c, y, m, d) {
  if (!c.months.has(m) || (c.years && !c.years.has(y))) return false;
  const last = daysIn(y, m);
  const w = weekday(y, m, d);
  const dom = c.dom;
  const domHit = dom.any || dom.values.has(d) || (dom.last && d === last - dom.lastOffset) || (dom.lastWeekday && d === nearestWeekday(y, m, last)) || dom.nearestWeekday.some((t) => nearestWeekday(y, m, t) === d);
  const dow = c.dow;
  const dowHit = dow.any || dow.values.has(w) || dow.nth.some((x) => x.day === w && Math.ceil(d / 7) === x.n) || dow.lastOf.some((x) => x === w && d + 7 > last);
  if (c.dialect === "unix" || c.dialect === "github" || c.dialect === "kubernetes") {
    // Vixie cron: two restricted day fields match when either does.
    if (!dom.any && !dow.any) return domHit || dowHit;
    return domHit && dowHit;
  }
  if (dom.question) return dowHit;
  if (dow.question) return domHit;
  return domHit && dowHit;
}

/** Warnings that do not make the expression invalid but surprise people. */
export function warningsFor(c) {
  const out = [];
  const unixLike = c.dialect === "unix" || c.dialect === "github" || c.dialect === "kubernetes";
  if (unixLike && !c.dom.any && !c.dow.any) out.push("Both day fields are restricted, so it runs on days matching either one (day-of-month OR day-of-week), not only days matching both.");
  for (const [name, text, size] of [["minute", c.raw.min, 60], ["hour", c.raw.hour, 24], ["second", c.raw.sec, 60]]) {
    const step = String(text ?? "").match(/^(?:\*|0)\/(\d+)$/)?.[1];
    if (step && size % Number(step) !== 0) out.push(`*/${step} in the ${name} field restarts at 0 each ${name === "hour" ? "day" : name === "minute" ? "hour" : "minute"}, so the last gap is shorter than ${step}.`);
  }
  if (c.dialect === "github") {
    const mins = [...c.minutes].sort((a, b) => a - b);
    const gaps = mins.map((v, i) => (i ? v - mins[i - 1] : 60 - mins.at(-1) + mins[0]));
    if (c.hours.size > 0 && mins.length > 1 && Math.min(...gaps) < 5) out.push("GitHub Actions runs schedules at most every 5 minutes; closer runs are skipped.");
    out.push("GitHub Actions schedules run in UTC and can start late when load is high.");
  }
  if (c.dialect === "aws") out.push("EventBridge cron runs in UTC unless the schedule sets a time zone (EventBridge Scheduler).");
  if (c.dialect === "kubernetes") out.push("Kubernetes CronJobs use the controller's time zone unless spec.timeZone is set.");
  return out;
}
