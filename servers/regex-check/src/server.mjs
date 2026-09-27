#!/usr/bin/env node
// regex-check: Tests regular expressions on the real engines, in process: JavaScript (V8), Python (CPython's re, via Pyodide), PCRE2 10.48 (PHP, grep -P, nginx) and RE2 (Go, BigQuery). Each engine gives its own verdict: compile errors with position, every match with its groups and named groups, and the result of a replacement; differences between engines are listed. Finds catastrophic backtracking (ReDoS) with an attack string and confirms it by timing the backtracking engines. Offline, no key.
//
// Tools live in src/tools/, one file each. The kit in src/kit/ is a copy of the factory kit
// (a drift test keeps it identical); it holds the network guard, the result wrapper and the
// stdio and HTTP entry points.
import { readFileSync } from "node:fs";
import { createServer, isMain, start } from "./kit/index.mjs";
import { warm } from "./engines.mjs";
import { checkRedosTool, testRegexTool } from "./tools/tools.mjs";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

export const SERVER_NAME = pkg.name;
export const SERVER_VERSION = pkg.version;
export const TOOLS = [testRegexTool, checkRedosTool];

export const INSTRUCTIONS = "Use test_regex with the pattern, flags and sample inputs, and the engines the code runs on (javascript, python, pcre, re2; default all four): each returns its own matches, groups and errors. Use check_redos before shipping a pattern that runs on untrusted input. Replacements use each engine's own syntax ($1 in JavaScript and PCRE, \\1 in Python).";

// Offline: the engines run in worker threads (src/engines.mjs), started ahead of the first call
// when the server runs for a client. timeoutMs is per engine and call.
export function createContext({ timeoutMs, warmEngines = false } = {}) {
  const ctx = { timeoutMs: timeoutMs ?? (Number(process.env.REGEX_CHECK_TIMEOUT_MS) || undefined) };
  if (warmEngines) warm(ctx);
  return ctx;
}

export function buildServer(ctx = createContext()) {
  return createServer({ name: SERVER_NAME, version: SERVER_VERSION, instructions: INSTRUCTIONS, tools: TOOLS, ctx });
}

if (isMain(import.meta.url)) start(() => buildServer(createContext({ warmEngines: true })), SERVER_NAME);
