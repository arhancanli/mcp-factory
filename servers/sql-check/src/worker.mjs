// src/worker.mjs
//
// The engines, in a worker thread so that a statement that never ends (an unbounded recursive
// query) can be stopped by terminating the thread (src/engines.mjs). PostgreSQL is PGlite: the
// real server compiled to WebAssembly, in memory, kept warm between jobs; each job runs inside one
// transaction that is rolled back, every statement inside its own savepoint, and the session is
// discarded afterwards. SQLite is sql.js: a new in-memory database per job. Neither can reach the
// host's files or network: their file systems are in memory.
import { parentPort } from "node:worker_threads";
import { splitStatements } from "./split.mjs";

// Statements that would end the sandbox's own transaction are not run.
const TRANSACTION_CONTROL = /^(BEGIN|START\s+TRANSACTION|COMMIT|END|ROLLBACK|ABORT|SAVEPOINT|RELEASE|PREPARE\s+TRANSACTION|COMMIT\s+PREPARED|ROLLBACK\s+PREPARED)\b/i;
const MAX_CELL = 200;

const stripComments = (t) => t.replace(/^(\s*(--[^\n]*\n|\/\*[\s\S]*?\*\/))*\s*/, "");

function cell(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === "bigint") return v.toString();
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? String(v) : v.toISOString();
  if (v instanceof Uint8Array) return `\\x${Buffer.from(v.subarray(0, 64)).toString("hex")}${v.length > 64 ? "..." : ""}`;
  if (typeof v === "object") v = JSON.stringify(v, (k, x) => (typeof x === "bigint" ? x.toString() : x));
  if (typeof v === "string" && v.length > MAX_CELL) return `${v.slice(0, MAX_CELL)}... (${v.length} chars)`;
  return v;
}

// "CREATE TABLE", "SELECT", "INSERT": the statement's kind.
function commandOf(body) {
  const m = body.match(/^(CREATE|ALTER|DROP)\s+(?:OR\s+REPLACE\s+)?(?:UNIQUE\s+|TEMP\s+|TEMPORARY\s+|MATERIALIZED\s+|UNLOGGED\s+)*([A-Za-z]+)/i);
  if (m) return `${m[1]} ${m[2]}`.toUpperCase();
  return body.match(/^[A-Za-z]+/)?.[0].toUpperCase();
}

let pg;
const typeNames = new Map([
  [16, "boolean"], [17, "bytea"], [20, "bigint"], [21, "smallint"], [23, "integer"], [25, "text"], [114, "json"], [700, "real"], [701, "double precision"], [1042, "character"], [1043, "character varying"],
  [1082, "date"], [1083, "time"], [1114, "timestamp"], [1184, "timestamptz"], [1186, "interval"], [1700, "numeric"], [2950, "uuid"], [3802, "jsonb"], [26, "oid"], [19, "name"], [18, "char"], [1266, "timetz"],
]);

async function pgType(oid) {
  if (!typeNames.has(oid)) {
    const r = await pg.query("SELECT format_type($1::oid, NULL) AS t", [oid]).catch(() => ({ rows: [{ t: String(oid) }] }));
    typeNames.set(oid, r.rows[0]?.t ?? String(oid));
  }
  return typeNames.get(oid);
}

async function runPostgres(stmts, { rows: wantRows, maxRows }, progress) {
  const out = [];
  for (let i = 0; i < stmts.length; i++) {
    const st = stmts[i];
    progress(i);
    const body = stripComments(st.text);
    if (TRANSACTION_CONTROL.test(body)) {
      out.push({ status: "skipped", note: "transaction control is not run: every check runs in one transaction that is rolled back" });
      continue;
    }
    await pg.exec("SAVEPOINT sql_check");
    try {
      // Rows as arrays: two columns with the same name (count(x), count(*)) must not collide.
      const r = await pg.query(st.text, [], { rowMode: "array" });
      await pg.exec("RELEASE SAVEPOINT sql_check");
      const res = { status: "ok", command: commandOf(body) };
      if (r.affectedRows !== undefined && /^(INSERT|UPDATE|DELETE|MERGE)\b/i.test(body)) res.affected = r.affectedRows;
      if (r.fields?.length && wantRows) {
        res.columns = await Promise.all(r.fields.map(async (f) => `${f.name} ${await pgType(f.dataTypeID)}`));
        res.row_count = r.rows.length;
        res.rows = r.rows.slice(0, maxRows).map((row) => row.map(cell));
      }
      out.push(res);
    } catch (e) {
      await pg.exec("ROLLBACK TO SAVEPOINT sql_check").catch(() => {});
      out.push({ status: "error", message: e.message, code: e.code, hint: e.hint, detail: e.detail, position: e.position ? Number(e.position) : undefined, where: e.where });
    }
  }
  return out;
}

async function postgres(job, progress) {
  if (!pg) {
    const { PGlite } = await import("@electric-sql/pglite");
    pg = await PGlite.create();
  }
  await pg.exec("BEGIN");
  try {
    const schema = await runPostgres(splitStatements(job.schema), { rows: false, maxRows: 0 }, (i) => progress("schema", i));
    const sql = await runPostgres(splitStatements(job.sql), { rows: true, maxRows: job.maxRows }, (i) => progress("sql", i));
    return { schema, sql };
  } finally {
    await pg.exec("ROLLBACK").catch(() => {});
    await pg.exec("DISCARD ALL").catch(() => {});
  }
}

let SQL;
function runSqlite(db, stmts, { rows: wantRows, maxRows }, progress) {
  const out = [];
  for (let i = 0; i < stmts.length; i++) {
    progress(i);
    const st = stmts[i];
    const body = stripComments(st.text);
    if (TRANSACTION_CONTROL.test(body)) {
      out.push({ status: "skipped", note: "transaction control is not run: every check starts from a new database" });
      continue;
    }
    try {
      const results = db.exec(st.text);
      const res = { status: "ok", command: commandOf(body) };
      if (/^(INSERT|UPDATE|DELETE|REPLACE)\b/i.test(body)) res.affected = db.getRowsModified();
      const last = results.at(-1);
      if (last && wantRows) {
        res.columns = last.columns;
        res.row_count = last.values.length;
        res.rows = last.values.slice(0, maxRows).map((r) => r.map(cell));
      }
      out.push(res);
    } catch (e) {
      out.push({ status: "error", message: String(e.message) });
    }
  }
  return out;
}

async function sqlite(job, progress) {
  if (!SQL) {
    const init = (await import("sql.js")).default;
    SQL = await init();
  }
  const db = new SQL.Database();
  try {
    const version = db.exec("SELECT sqlite_version()")[0].values[0][0];
    const schema = runSqlite(db, splitStatements(job.schema), { rows: false, maxRows: 0 }, (i) => progress("schema", i));
    const sql = runSqlite(db, splitStatements(job.sql), { rows: true, maxRows: job.maxRows }, (i) => progress("sql", i));
    const fk = db.exec("PRAGMA foreign_keys")[0]?.values[0][0];
    return { schema, sql, version, foreignKeys: fk === 1 };
  } finally {
    db.close();
  }
}

parentPort.on("message", async (job) => {
  const progress = (phase, index) => parentPort.postMessage({ id: job.id, progress: { phase, index } });
  try {
    const result = job.dialect === "postgres" ? await postgres(job, progress) : await sqlite(job, progress);
    if (job.dialect === "postgres") result.version = (await pg.query("SHOW server_version")).rows[0].server_version;
    parentPort.postMessage({ id: job.id, result });
  } catch (e) {
    parentPort.postMessage({ id: job.id, error: String(e?.message ?? e) });
  }
});
