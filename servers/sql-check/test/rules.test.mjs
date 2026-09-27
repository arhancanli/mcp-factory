// Unit rules: splitting SQL into statements, and line/column numbers. No engine.
import assert from "node:assert/strict";
import test from "node:test";
import { lineColumn, splitStatements } from "../src/split.mjs";

const texts = (sql) => splitStatements(sql).map((s) => s.text);

test("semicolons inside quotes, dollar quotes and comments do not end a statement", () => {
  assert.deepEqual(texts("SELECT 'a;b'; SELECT \"c;d\"; SELECT `e;f`"), ["SELECT 'a;b'", 'SELECT "c;d"', "SELECT `e;f`"]);
  assert.deepEqual(texts("SELECT $$x;y$$; SELECT $tag$ a; $$ b; $tag$"), ["SELECT $$x;y$$", "SELECT $tag$ a; $$ b; $tag$"]);
  assert.deepEqual(texts("SELECT E'it\\'s;'; SELECT 'it''s;'"), ["SELECT E'it\\'s;'", "SELECT 'it''s;'"]);
  assert.deepEqual(texts("/* a; /* nested; */ b; */ SELECT 1; -- c; d\nSELECT 2"), ["/* a; /* nested; */ b; */ SELECT 1", "-- c; d\nSELECT 2"]);
  assert.deepEqual(texts("SELECT $1; SELECT a$b FROM t"), ["SELECT $1", "SELECT a$b FROM t"], "parameters and identifiers with $ are not dollar quotes");
});

test("bodies with their own semicolons: SQLite triggers, BEGIN ATOMIC, PL/pgSQL", () => {
  assert.deepEqual(texts("CREATE TRIGGER t AFTER INSERT ON x BEGIN UPDATE x SET a = CASE WHEN 1 THEN 2 END; DELETE FROM y; END; SELECT 1"), ["CREATE TRIGGER t AFTER INSERT ON x BEGIN UPDATE x SET a = CASE WHEN 1 THEN 2 END; DELETE FROM y; END", "SELECT 1"]);
  assert.deepEqual(texts("CREATE PROCEDURE p() BEGIN ATOMIC SELECT 1; SELECT 2; END; SELECT 3"), ["CREATE PROCEDURE p() BEGIN ATOMIC SELECT 1; SELECT 2; END", "SELECT 3"]);
  assert.deepEqual(texts("CREATE FUNCTION f() RETURNS int AS $$ BEGIN RETURN 1; END; $$ LANGUAGE plpgsql; BEGIN; COMMIT;"), ["CREATE FUNCTION f() RETURNS int AS $$ BEGIN RETURN 1; END; $$ LANGUAGE plpgsql", "BEGIN", "COMMIT"], "BEGIN as a transaction is its own statement");
});

test("empty statements and comment-only tails are dropped; offsets point at the statement", () => {
  const s = splitStatements(";;\n  SELECT 1;\n-- trailing\n");
  assert.deepEqual(s.map((x) => [x.text, x.start]), [["SELECT 1", 5]]);
  assert.deepEqual(lineColumn("a\nbc\ndef", 6), { line: 3, column: 2 });
  assert.deepEqual(lineColumn("abc", 0), { line: 1, column: 1 });
});
