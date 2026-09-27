// Weekly canary (.github/workflows/canary.yml): the engines as installed from npm, on the Node that
// runs them: PostgreSQL's hint for a misspelt column and SQLite's refusal of ILIKE.
import assert from "node:assert/strict";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { stopEngines } from "../src/engines.mjs";
import { buildServer, createContext } from "../src/server.mjs";

const ctx = createContext();
const client = new Client({ name: "canary", version: "0" });
const [a, b] = InMemoryTransport.createLinkedPair();
await Promise.all([buildServer(ctx).connect(a), client.connect(b)]);
await client.listTools();

test("live: both engines start and answer with their own errors", { timeout: 60_000 }, async () => {
  const r = await client.callTool({ name: "check_sql", arguments: { schema: "CREATE TABLE t (email TEXT);", sql: "SELECT emial FROM t; SELECT email FROM t WHERE email ILIKE 'a%';", dialect: "both" } });
  const [pg, lite] = r.structuredContent.results;
  assert.equal(pg.statements[0].hint, 'Perhaps you meant to reference the column "t.email".');
  assert.equal(pg.statements[1].status, "ok");
  assert.match(lite.statements[1].error, /syntax error/);
  await client.close();
  await stopEngines(ctx);
});
