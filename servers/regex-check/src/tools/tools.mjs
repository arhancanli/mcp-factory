import { z } from "zod";
import { defineTool } from "../kit/index.mjs";
import { checkRedos, testRegex } from "../check.mjs";

const OFFLINE = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const FLAVOR = z.enum(["javascript", "python", "pcre", "re2"]);

export const testRegexTool = defineTool({
  name: "test_regex",
  title: "Test a regex on real engines",
  description: "Runs a regex on real engines: JavaScript (V8), Python (CPython re), PCRE2 (PHP, grep -P), RE2 (Go, BigQuery). Each gives its compile error with position, or every match with groups and named groups, and the replacement result in its own syntax. Positions are in characters. Lists where engines disagree.",
  input: {
    pattern: z.string().min(1).max(4000),
    flags: z.string().max(8).optional().describe("any of i m s x u"),
    inputs: z.array(z.string().max(20_000)).min(1).max(20),
    flavors: z.array(FLAVOR).min(1).max(4).optional().describe("default all four"),
    replacement: z.string().max(1000).optional(),
    max_matches: z.number().int().min(1).max(100).optional(),
  },
  output: { engines: z.array(z.looseObject({ flavor: z.string(), engine: z.string() })) },
  annotations: OFFLINE,
  handler: async (args, ctx) => testRegex(ctx, args),
});

export const checkRedosTool = defineTool({
  name: "check_redos",
  title: "Can this regex be made to hang?",
  description: "Checks a regex for catastrophic backtracking (ReDoS): safe or vulnerable, exponential or polynomial, the part of the pattern to blame, an attack string, and how long each real engine (JavaScript, Python, PCRE2, RE2) takes on it. Use before a pattern runs on untrusted input.",
  input: {
    pattern: z.string().min(1).max(4000),
    flags: z.string().max(8).optional(),
    verify: z.boolean().optional().describe("time the attack on the engines (default true)"),
  },
  output: { status: z.string() },
  annotations: OFFLINE,
  handler: async (args, ctx) => checkRedos(ctx, args),
});
