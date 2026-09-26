import { z } from "zod";
import { compact, defineTool, ToolError } from "../kit/index.mjs";
import { convertCron } from "../convert.mjs";
import { DIALECTS, parseCron, warningsFor } from "../cron.mjs";
import { describe, nextRuns, zoneOf } from "../schedule.mjs";

const OFFLINE = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const dialect = z.enum(DIALECTS).optional().describe("detected when omitted");
const DEFAULT_ZONE = { github: "UTC", aws: "UTC" };

export const explainCron = defineTool({
  name: "explain_cron",
  title: "Explain and check cron expressions",
  description: "Explains up to 20 cron expressions in plain English and checks them: valid or why not, the dialect, gotchas (day-of-month OR day-of-week, uneven steps, GitHub's 5-minute floor), schedules that never fire, and the next 3 runs in UTC.",
  input: { expressions: z.array(z.string().max(120)).min(1).max(20), dialect },
  output: { results: z.array(z.looseObject({ expression: z.string(), valid: z.boolean() })) },
  annotations: OFFLINE,
  handler: async ({ expressions, dialect: d }, ctx) => {
    const now = ctx.now?.() ?? Date.now();
    const results = expressions.map((e) => {
      try {
        const c = parseCron(e, d);
        const next = nextRuns(c, "UTC", now, 3);
        return compact({ expression: e, valid: next.length > 0, dialect: c.dialect, description: describe(c), next_utc: next.map((r) => r.utc), warnings: warningsFor(c), error: next.length ? undefined : "It never fires: no date in the next six years matches (for example February 30)." });
      } catch (err) {
        if (err instanceof ToolError) return { expression: e, valid: false, error: err.message };
        throw err;
      }
    });
    return { results };
  },
});

export const nextRunsTool = defineTool({
  name: "next_runs",
  title: "When a cron expression fires",
  description: "The next runs of a cron expression in an IANA time zone (default UTC), as local time with weekday and UTC, after a given moment or now. Runs that land in a daylight-saving gap or repeat are flagged, as schedulers differ there.",
  input: { expression: z.string().max(120), timezone: z.string().max(60).optional(), count: z.number().int().min(1).max(50).optional().describe("default 5"), from: z.string().max(30).optional().describe("ISO date-time"), dialect },
  output: { expression: z.string(), timezone: z.string(), runs: z.array(z.looseObject({ local: z.string(), utc: z.string() })) },
  annotations: OFFLINE,
  handler: async ({ expression, timezone, count = 5, from, dialect: d }, ctx) => {
    const c = parseCron(expression, d);
    const zone = zoneOf(timezone ?? DEFAULT_ZONE[c.dialect] ?? "UTC");
    const start = from ? Date.parse(from) : (ctx.now?.() ?? Date.now());
    if (Number.isNaN(start)) throw new ToolError("bad_date", `"${from}" is not a date-time; write 2026-10-25T00:00:00Z.`);
    const runs = nextRuns(c, zone, start, count).map(compact);
    return { ...compact({ dialect: c.dialect, description: describe(c), note: runs.length ? (c.dialect === "github" && zone !== "UTC" ? "GitHub Actions runs schedules in UTC; these are those UTC times shown in your zone." : undefined) : "It never fires in the next six years." }), expression, timezone: zone, runs };
  },
});

export const convertCronTool = defineTool({
  name: "convert_cron",
  title: "Convert cron between schedulers",
  description: "Rewrites a cron expression for another scheduler (unix, github, kubernetes, aws, quartz, spring): seconds and year fields, ? rules, weekday numbering (written as names). Says why when the target cannot express it.",
  input: { expression: z.string().max(120), to: z.enum(DIALECTS), from: dialect },
  output: { expression: z.string(), to: z.string() },
  annotations: OFFLINE,
  handler: async ({ expression, to, from }) => {
    const c = parseCron(expression, from);
    const out = convertCron(c, to);
    const check = parseCron(out.expression, to);
    return { ...compact({ from: c.dialect, description: describe(check), note: to === "github" ? "GitHub Actions runs it in UTC." : to === "aws" ? "EventBridge runs it in UTC unless the schedule sets a time zone." : undefined }), expression: out.expression, to };
  },
});
