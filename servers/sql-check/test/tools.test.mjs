// Golden tests: check_sql over a real MCP client, on the real engines (PGlite, sql.js), in memory.
import assert from "node:assert/strict";
import test from "node:test";
import { stopEngines } from "../src/engines.mjs";
import { call, connect } from "./harness.mjs";
import { PORTABLE, QUERIES, SCHEMA } from "./scenarios.mjs";

const { client, ctx } = await connect();
test.after(() => stopEngines(ctx));

test("check_sql on PostgreSQL: each statement's verdict, with line, column, hint and advice", async () => {
  const { data } = await call(client, "check_sql", { schema: SCHEMA, sql: QUERIES });
  const [pg] = data.results;
  assert.equal(pg.version.startsWith("PostgreSQL 18"), true);
  assert.deepEqual(pg.counts, { ok: 2, error: 5 });
  assert.equal(pg.statements.length, 7);
  assert.equal(pg.schema_errors, undefined);
  const s = pg.statements;
  assert.deepEqual([s[0].line, s[0].status, s[0].command, s[0].columns, s[0].rows], [2, "ok", "SELECT", ["email text", "spent numeric"], [["ana@example.com", "13.50"], ["ben@example.com", null]]]);
  assert.deepEqual([s[1].line, s[1].column, s[1].code], [6, 17, "42803"]);
  assert.match(s[1].error, /column "o.total" must appear in the GROUP BY clause/);
  assert.deepEqual([s[2].line, s[2].column, s[2].hint], [7, 8, 'Perhaps you meant to reference the column "users.email".']);
  assert.equal(s[3].advice, "DATE_SUB/DATE_ADD are MySQL; PostgreSQL writes now() - interval '1 day'");
  assert.deepEqual([s[4].code, s[4].detail], ["23514", "Failing row contains (3, 1, 5.00, shipped)."]);
  assert.deepEqual([s[5].code, s[5].detail], ["23503", 'Key (user_id)=(9) is not present in table "users".']);
  assert.deepEqual([s[6].status, s[6].command, s[6].affected, s[6].rows], ["ok", "UPDATE", 1, [[1, "paid"]]]);
});

test("every call starts from an empty database; nothing persists between calls", async () => {
  await call(client, "check_sql", { sql: "CREATE TABLE leftover (id int); INSERT INTO leftover VALUES (1);" });
  const { data } = await call(client, "check_sql", { sql: "SELECT * FROM leftover;" });
  assert.equal(data.results[0].statements[0].error, 'relation "leftover" does not exist');
  assert.equal(data.results[0].statements[0].advice, "the table is not in the schema passed: include its CREATE TABLE in schema");
});

test("dialect both: where PostgreSQL and SQLite disagree, with each engine's advice", async () => {
  const { data } = await call(client, "check_sql", { sql: PORTABLE, dialect: "both" });
  const [pg, lite] = data.results;
  assert.deepEqual(pg.statements.map((x) => x.status), ["ok", "error", "ok", "ok"]);
  assert.deepEqual(lite.statements.map((x) => x.status), ["ok", "ok", "error", "ok"]);
  assert.equal(pg.statements[1].advice, "in PostgreSQL an INTEGER PRIMARY KEY is not filled in by itself (in SQLite it is): declare id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY, or pass its value");
  assert.equal(lite.statements[2].advice, "SQLite has no ILIKE; its LIKE is already case-insensitive for ASCII letters");
  assert.equal(data.portable, false);
  assert.deepEqual(data.differences, ["line 2: error on PostgreSQL, ok on SQLite", "line 3: ok on PostgreSQL, error on SQLite"]);
  assert.deepEqual(lite.statements[3].rows, [["rollback", "2026-09-02"]]);
});

test("SQLite: a schema written for PostgreSQL, and foreign keys not enforced by default", async () => {
  const { data } = await call(client, "check_sql", { schema: SCHEMA, sql: "INSERT INTO orders (user_id, total, status) VALUES (9, 1, 'open');", dialect: "sqlite" });
  const [lite] = data.results;
  assert.deepEqual(lite.schema_errors.map((e) => e.line), [1, 12]);
  assert.match(lite.schema_errors[0].advice, /SQLite has no now\(\)/);
  assert.equal(lite.schema_errors[1].advice, 'its CREATE TABLE in the schema failed (schema line 1: near "(": syntax error)');
  assert.equal(lite.statements[0].status, "ok", "orders exists (SQLite takes serial as a type name), and the foreign key is not enforced");
  assert.match(lite.notes[0], /PRAGMA foreign_keys = ON/);
  const fk = await call(client, "check_sql", { schema: "CREATE TABLE a (id INTEGER PRIMARY KEY); CREATE TABLE b (a_id INTEGER REFERENCES a(id));", sql: "INSERT INTO b VALUES (9);", dialect: "sqlite" });
  assert.equal(fk.data.results[0].statements[0].status, "ok");
  assert.match(fk.data.results[0].notes[0], /PRAGMA foreign_keys = ON/);
  const on = await call(client, "check_sql", { schema: "PRAGMA foreign_keys = ON; CREATE TABLE a (id INTEGER PRIMARY KEY); CREATE TABLE b (a_id INTEGER REFERENCES a(id));", sql: "INSERT INTO b VALUES (9);", dialect: "sqlite" });
  assert.equal(on.data.results[0].statements[0].error, "FOREIGN KEY constraint failed");
});

test("transaction control is skipped; a statement that needs its own transaction says so", async () => {
  const { data } = await call(client, "check_sql", { schema: "CREATE TABLE t (email text);", sql: "BEGIN;\nCREATE INDEX CONCURRENTLY t_email ON t (email);\nCOMMIT;" });
  const s = data.results[0].statements;
  assert.deepEqual(s.map((x) => x.status), ["skipped", "error", "skipped"]);
  assert.equal(s[1].code, "25001");
  assert.match(s[1].advice, /must run it outside one/);
});

test("columns with the same name keep their own values (count(x) beside count(*))", async () => {
  const { data } = await call(client, "check_sql", { sql: "SELECT count(x), count(*), 7 / 2, 7 / 2.0 FROM (VALUES (1), (NULL), (3)) v(x);" });
  assert.deepEqual(data.results[0].statements[0].rows, [[2, 3, 3, "3.5000000000000000"]]);
  assert.deepEqual(data.results[0].statements[0].columns, ["count bigint", "count bigint", "?column? integer", "?column? numeric"]);
});

test("values as JSON: bigint, dates, bytea, json, long text; rows capped by max_rows", async () => {
  const { data } = await call(client, "check_sql", { sql: "SELECT 9007199254740993::bigint AS big, DATE '2026-09-27' AS d, '\\x0102'::bytea AS b, '{\"a\": [1]}'::jsonb AS j, repeat('x', 300) AS long; SELECT g FROM generate_series(1, 50) g;", max_rows: 3 });
  const [one, many] = data.results[0].statements;
  assert.deepEqual(one.rows[0].slice(0, 4), ["9007199254740993", "2026-09-27T00:00:00.000Z", "\\x0102", '{"a":[1]}']);
  assert.match(one.rows[0][4], /^x{200}\.\.\. \(300 chars\)$/);
  assert.deepEqual([many.row_count, many.rows.length], [50, 3]);
});

test("a statement that never ends is stopped at the time limit, and the engine is replaced", async () => {
  const { client: slow, ctx: slowCtx } = await connect({ timeoutMs: 3000 });
  try {
    await call(slow, "check_sql", { sql: "SELECT 1;" });
    const stuck = slowCtx.engines.postgres.worker;
    const exited = new Promise((done) => stuck.once("exit", () => done(true)));
    const t0 = Date.now();
    const { res } = await call(slow, "check_sql", { sql: "SELECT 1;\nWITH RECURSIVE r(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM r) SELECT count(*) FROM r;" });
    assert.equal(res.isError, true);
    assert.match(res.content[0].text, /Statement 2 of the SQL did not finish within 3 s/);
    assert.ok(Date.now() - t0 < 8000);
    assert.equal(await Promise.race([exited, new Promise((done) => setTimeout(() => done(false), 3000))]), true, "the stuck engine's thread is ended, not left spinning");
    const after = await call(slow, "check_sql", { sql: "SELECT 42 AS answer;" });
    assert.deepEqual(after.data.results[0].statements[0].rows, [[42]]);
  } finally {
    await stopEngines(slowCtx);
  }
});
