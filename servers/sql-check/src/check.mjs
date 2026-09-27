// src/check.mjs
//
// check_sql: the engines' verdicts (src/worker.mjs) turned into a report: each statement with its
// line, what it did or the error with line and column, and, when SQL written for another database
// fails, what that database wrote and what this one accepts.
import { runJob } from "./engines.mjs";
import { lineColumn, splitStatements } from "./split.mjs";

// SQL from other databases that the engines refuse, and what they accept. `pg` and `sqlite` are the
// advice for each engine; a hint is shown only when the statement failed on that engine.
const HINTS = [
  { re: /`[^`\n]+`/, pg: 'backticks quote identifiers in MySQL; PostgreSQL uses double quotes ("name")' },
  { re: /\[[A-Za-z_][\w ]*\]/, pg: 'square brackets quote identifiers in SQL Server; PostgreSQL uses double quotes ("name")' },
  { re: /\bDATE_(SUB|ADD)\s*\(/i, pg: "DATE_SUB/DATE_ADD are MySQL; PostgreSQL writes now() - interval '1 day'", sqlite: "DATE_SUB/DATE_ADD are MySQL; SQLite writes datetime('now', '-1 day')" },
  { re: /\bIFNULL\s*\(/i, pg: "IFNULL is MySQL and SQLite; PostgreSQL uses COALESCE(a, b)" },
  { re: /\bISNULL\s*\(/i, pg: "ISNULL(a, b) is SQL Server; use COALESCE(a, b)", sqlite: "ISNULL(a, b) is SQL Server; use COALESCE(a, b)" },
  { re: /\bLIMIT\s+\d+\s*,\s*\d+/i, pg: "LIMIT offset, count is MySQL; PostgreSQL writes LIMIT count OFFSET offset" },
  { re: /\bAUTO_INCREMENT\b/i, pg: "AUTO_INCREMENT is MySQL; PostgreSQL uses GENERATED ALWAYS AS IDENTITY (or serial)", sqlite: "AUTO_INCREMENT is MySQL; SQLite assigns INTEGER PRIMARY KEY values itself (AUTOINCREMENT only if ids must never be reused)" },
  { re: /\bON\s+DUPLICATE\s+KEY\s+UPDATE\b/i, pg: "ON DUPLICATE KEY UPDATE is MySQL; write ON CONFLICT (key) DO UPDATE SET col = EXCLUDED.col", sqlite: "ON DUPLICATE KEY UPDATE is MySQL; write ON CONFLICT (key) DO UPDATE SET col = excluded.col" },
  { re: /\bSELECT\s+(DISTINCT\s+)?TOP\s*\(?\s*\d+/i, pg: "SELECT TOP n is SQL Server; write ... LIMIT n", sqlite: "SELECT TOP n is SQL Server; write ... LIMIT n" },
  { re: /\bGETDATE\s*\(\s*\)/i, pg: "GETDATE() is SQL Server; use now() or CURRENT_TIMESTAMP", sqlite: "GETDATE() is SQL Server; use CURRENT_TIMESTAMP or datetime('now')" },
  { re: /\bNOW\s*\(\s*\)/i, sqlite: "SQLite has no now(); use CURRENT_TIMESTAMP or datetime('now')" },
  { re: /::\s*[A-Za-z]/, sqlite: "SQLite has no :: casts; write CAST(x AS type)" },
  { re: /\bILIKE\b/i, sqlite: "SQLite has no ILIKE; its LIKE is already case-insensitive for ASCII letters" },
  { re: /\bSERIAL\b/i, sqlite: "SQLite has no SERIAL; an INTEGER PRIMARY KEY column is assigned automatically" },
  { re: /\bENGINE\s*=|\bDEFAULT\s+CHARSET\b|\bCHARSET\s*=|\bCOLLATE\s*=/i, pg: "ENGINE= and CHARSET= are MySQL table options; remove them", sqlite: "ENGINE= and CHARSET= are MySQL table options; remove them" },
  { re: /\bUNSIGNED\b/i, pg: "PostgreSQL has no unsigned integers; use CHECK (col >= 0) or a wider type" },
  { re: /\bCURDATE\s*\(\s*\)/i, pg: "CURDATE() is MySQL; use CURRENT_DATE", sqlite: "CURDATE() is MySQL; use CURRENT_DATE" },
  { re: /\bDATEDIFF\s*\(/i, pg: "DATEDIFF is MySQL/SQL Server; in PostgreSQL subtract dates (d2 - d1 gives days) or use age()", sqlite: "DATEDIFF is MySQL/SQL Server; in SQLite use julianday(d2) - julianday(d1)" },
  { re: /\bGROUP_CONCAT\s*\(/i, pg: "GROUP_CONCAT is MySQL/SQLite; PostgreSQL uses string_agg(col, ',')" },
  { re: /\bDATETIME\b|\bTINYINT\s*\(\s*1\s*\)/i, pg: "DATETIME and TINYINT(1) are MySQL types; PostgreSQL uses timestamp (or timestamptz) and boolean" },
  { re: /\bNVARCHAR\b|\bNTEXT\b|\bBIT\b/i, pg: "NVARCHAR, NTEXT and BIT are SQL Server types; PostgreSQL uses varchar, text and boolean" },
];

// Advice for PostgreSQL error codes, beside PostgreSQL's own hint.
const CODE_HINTS = {
  25001: "it works when run on its own; a migration tool that wraps each migration in a transaction must run it outside one",
  "42P01": "the table is not in the schema passed: include its CREATE TABLE in schema",
};

const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 3)}...` : s);
const firstLine = (text, stmt) => lineColumn(text, stmt.start + (stmt.text.length - stmt.text.replace(/^(\s*(--[^\n]*\n|\/\*[\s\S]*?\*\/))*\s*/, "").length)).line;

// The table an "unknown table" error names, in either engine's wording.
const missingTable = (message) => message.match(/^relation "([^"]+)" does not exist|^no such table: (\S+)/)?.slice(1).find(Boolean);

// SQLite fills an INTEGER PRIMARY KEY by itself; PostgreSQL does not.
function nullKeyAdvice(message, allText) {
  const col = message.match(/^null value in column "([^"]+)"/)?.[1];
  if (col && new RegExp(`\\b${col}\\s+INTEGER\\s+PRIMARY\\s+KEY\\b`, "i").test(allText)) return `in PostgreSQL an INTEGER PRIMARY KEY is not filled in by itself (in SQLite it is): declare ${col} integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY, or pass its value`;
  return undefined;
}

function report(dialect, text, stmts, results, failedSchema = [], allText = text) {
  return results.map((r, i) => {
    const st = stmts[i];
    const body = st.text.replace(/^(\s*(--[^\n]*\n|\/\*[\s\S]*?\*\/))*\s*/, "");
    const out = { line: firstLine(text, st), sql: clip(body.replace(/\s+/g, " "), 100), status: r.status };
    if (r.status === "error") {
      if (r.position) {
        const at = lineColumn(text, st.start + r.position - 1);
        out.line = at.line;
        out.column = at.column;
      }
      out.error = r.message;
      if (r.detail) out.detail = r.detail;
      if (r.hint) out.hint = r.hint;
      if (r.code) out.code = r.code;
      const table = missingTable(r.message);
      const failedCreate = table && failedSchema.find((f) => new RegExp(`^\\s*CREATE\\s+(?:TEMP\\w*\\s+)?TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?["\`]?(?:\\w+\\.)?${table.replace(/^.*\./, "")}\\b`, "i").test(f.body));
      const advice = [dialect === "postgres" ? nullKeyAdvice(r.message, allText) : undefined, failedCreate ? `its CREATE TABLE in the schema failed (schema line ${failedCreate.line}: ${failedCreate.error})` : table ? CODE_HINTS["42P01"] : undefined, CODE_HINTS[r.code] !== CODE_HINTS["42P01"] ? CODE_HINTS[r.code] : undefined, ...HINTS.filter((h) => h[dialect === "postgres" ? "pg" : "sqlite"] && h.re.test(st.text)).map((h) => h[dialect === "postgres" ? "pg" : "sqlite"])].filter(Boolean);
      if (advice.length) out.advice = [...new Set(advice)].join("; ");
    } else {
      for (const k of ["command", "affected", "columns", "row_count", "rows", "note"]) if (r[k] !== undefined) out[k] = r[k];
    }
    return out;
  });
}

async function checkOne(ctx, dialect, { schema, sql, maxRows }) {
  const res = await runJob(ctx, { dialect, schema, sql, maxRows });
  const schemaStmts = splitStatements(schema);
  const sqlStmts = splitStatements(sql);
  const failedIn = (rep) => rep.map((r, i) => ({ ...r, body: schemaStmts[i].text.replace(/^(\s*(--[^\n]*\n|\/\*[\s\S]*?\*\/))*\s*/, "") })).filter((r) => r.status === "error");
  // Twice: a later schema statement that uses a table whose CREATE failed says so too.
  const allText = `${schema}\n${sql}`;
  const failedSchema = failedIn(report(dialect, schema, schemaStmts, res.schema, [], allText));
  const schemaReport = report(dialect, schema, schemaStmts, res.schema, failedSchema, allText);
  const statements = report(dialect, sql, sqlStmts, res.sql, failedSchema, allText);
  const counts = {};
  for (const s of statements) counts[s.status] = (counts[s.status] ?? 0) + 1;
  const notes = [];
  if (dialect === "sqlite" && !res.foreignKeys && /\bREFERENCES\b/i.test(`${schema}\n${sql}`)) notes.push("SQLite enforces foreign keys only after PRAGMA foreign_keys = ON on the connection; it is off here, as by default, so rows that break a foreign key were accepted.");
  const out = { dialect, version: `${dialect === "postgres" ? "PostgreSQL" : "SQLite"} ${res.version}`, counts, statements };
  const schemaErrors = schemaReport.filter((s) => s.status === "error");
  if (schemaErrors.length) out.schema_errors = schemaErrors;
  if (notes.length) out.notes = notes;
  return out;
}

export async function checkSql(ctx, { sql, schema = "", dialect = "postgres", max_rows: maxRows = 20 }) {
  const dialects = dialect === "both" ? ["postgres", "sqlite"] : [dialect];
  const results = [];
  for (const d of dialects) results.push(await checkOne(ctx, d, { schema, sql, maxRows }));
  const out = { results };
  if (results.length === 2) {
    const [a, b] = results;
    const differs = a.statements.map((s, i) => (s.status !== b.statements[i]?.status ? `line ${s.line}: ${s.status} on PostgreSQL, ${b.statements[i]?.status} on SQLite` : undefined)).filter(Boolean);
    out.portable = differs.length === 0 && a.statements.every((s) => s.status !== "error");
    if (differs.length) out.differences = differs;
  }
  return out;
}
