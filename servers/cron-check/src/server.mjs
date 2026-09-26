#!/usr/bin/env node
// cron-check: Cron expressions checked instead of guessed: a plain-English explanation, validation with the gotchas that bite (day-of-month OR day-of-week, steps that do not divide evenly, dates that never come), the next run times in any time zone with daylight-saving effects noted, and conversion between Unix cron, GitHub Actions, Kubernetes, AWS EventBridge, Quartz and Spring. Offline, no key.
//
// Tools live in src/tools/, one file each. The kit in src/kit/ is a copy of the factory kit
// (a drift test keeps it identical); it holds the network guard, the result wrapper and the
// stdio and HTTP entry points.
import { readFileSync } from "node:fs";
import { createServer, isMain, start } from "./kit/index.mjs";
import { convertCronTool, explainCron, nextRunsTool } from "./tools/tools.mjs";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

export const SERVER_NAME = pkg.name;
export const SERVER_VERSION = pkg.version;
export const TOOLS = [explainCron, nextRunsTool, convertCronTool];

export const INSTRUCTIONS = "Use explain_cron to check and describe expressions (dialect detected or given), next_runs to list when one fires in a time zone, and convert_cron to rewrite one for another scheduler. Dialects differ: Quartz and AWS number Sunday 1, need ? in one day field, and add seconds or years.";

// Offline: cron arithmetic and Node's time zone database. now is injectable for tests.
export function createContext({ now } = {}) {
  return { now };
}

export function buildServer(ctx = createContext()) {
  return createServer({ name: SERVER_NAME, version: SERVER_VERSION, instructions: INSTRUCTIONS, tools: TOOLS, ctx });
}

if (isMain(import.meta.url)) start(() => buildServer(), SERVER_NAME);
