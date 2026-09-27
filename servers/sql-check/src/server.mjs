#!/usr/bin/env node
// sql-check: Checks SQL on the real engines, in memory: PostgreSQL 18 (PGlite) and SQLite 3.49 (sql.js), no database server needed. Give your schema (migrations, DDL, sample rows) and the queries: every statement runs inside a transaction that is rolled back, and gets the database's own verdict: its error with line and column, PostgreSQL's hint, constraint violations, and the rows it returns. MySQL and SQL Server syntax that fails is named, with the form each engine accepts. No key, no network.
//
// Tools live in src/tools/, one file each. The kit in src/kit/ is a copy of the factory kit
// (a drift test keeps it identical); it holds the network guard, the result wrapper and the
// stdio and HTTP entry points.
import { readFileSync } from "node:fs";
import { createServer, isMain, start } from "./kit/index.mjs";
import { warm } from "./engines.mjs";
import { checkSqlTool } from "./tools/check-sql.mjs";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

export const SERVER_NAME = pkg.name;
export const SERVER_VERSION = pkg.version;
export const TOOLS = [checkSqlTool];

export const INSTRUCTIONS = "Use check_sql with the dialect (postgres or sqlite, or both to test portability), the schema (CREATE TABLE statements, migrations, optional INSERTs of sample rows) and the SQL to check. Every call starts from an empty in-memory database; statements run inside a transaction that is rolled back, and queries return up to 20 rows.";

// Offline: the engines run in a worker thread (src/engines.mjs), started ahead of the first call
// when the server runs for a client. timeoutMs is per call.
export function createContext({ timeoutMs, warmEngines = false } = {}) {
  const ctx = { timeoutMs: timeoutMs ?? (Number(process.env.SQL_CHECK_TIMEOUT_MS) || undefined) };
  if (warmEngines) warm(ctx);
  return ctx;
}

export function buildServer(ctx = createContext()) {
  return createServer({ name: SERVER_NAME, version: SERVER_VERSION, instructions: INSTRUCTIONS, tools: TOOLS, ctx });
}

if (isMain(import.meta.url)) start(() => buildServer(createContext({ warmEngines: true })), SERVER_NAME);
