# SQL Check: launch kit

Numbers are filled from the server's measured files (`node scripts/launch-kit.mjs sql-check`).
Post only after the release is on npm.

## Positioning

- One line: runs SQL on real PostgreSQL and SQLite engines in memory, so agents check queries and
  migrations against the database's own verdict instead of guessing.
- Who it is for: developers whose agents write queries, migrations and schema changes without
  access to the database; anyone porting SQL between PostgreSQL, SQLite and MySQL-flavoured code.
- Why now: PostgreSQL now runs in WebAssembly (PGlite), so the real parser, planner and executor fit
  inside an MCP server; no connection string, no Docker, no risk to a real database.
- Proof: PostgreSQL 18's own errors and hints with line and column, constraint violations with the
  failing row, results on sample rows, every statement checked in a rolled-back transaction, and
  advice when MySQL or SQL Server syntax fails. Tool definitions of 800 characters.

## Show HN

**Title:** Show HN: SQL Check, an MCP server that runs your SQL on real PostgreSQL in memory

**Text:**

Coding agents write SQL for databases they cannot reach, so they guess: is this GROUP BY valid,
is the column called email or email_address, does DATE_SUB exist in PostgreSQL, what does
round(2.5::float) return (2, not 3).

PGlite compiles PostgreSQL itself to WebAssembly, so I put it, with SQLite (sql.js), inside an MCP
server. The agent passes the schema (migrations, sample rows) and the SQL; every statement runs in
its own savepoint inside a transaction that is rolled back, and comes back with PostgreSQL's own
error, hint, line and column, the constraint it violates, or its rows. MySQL and SQL Server syntax
that fails gets the equivalent the engine accepts, and dialect: both lists where PostgreSQL and
SQLite disagree. No database, no network; a statement that never ends is stopped at a time limit.

MIT: https://github.com/arhancanli/sql-check-mcp. `npx -y sql-check-mcp`

## Reddit: r/PostgreSQL, r/SQL (check each subreddit's rules first)

**Title:** Free tool that lets AI agents run SQL on a real in-memory PostgreSQL before touching yours

**Text:** PostgreSQL 18 (PGlite) and SQLite 3.49 in memory: schema first, then each statement's own
error with hint and position, constraint violations, or rows. MySQL-to-PostgreSQL advice included.
Works in Claude Code, Cursor and other MCP clients. https://github.com/arhancanli/sql-check-mcp

## Reddit: r/mcp

**Title:** SQL Check: real PostgreSQL and SQLite in memory, in 1 tool

**Text:** `check_sql`. Tool definitions 800 characters. `claude mcp add sql-check -- npx -y sql-check-mcp`. https://github.com/arhancanli/sql-check-mcp

## X / Bluesky thread

1. round(2.5::float) in PostgreSQL is 2. 'a' || NULL is NULL. x NOT IN (2, NULL) matches nothing. Agents guess these.
2. I built an MCP server that runs SQL on real PostgreSQL 18 and SQLite in memory (PGlite, sql.js). No database needed.
3. Schema first, then every statement's own error, hint and column, constraint violations, or rows, all rolled back.
4. Free, MIT: https://github.com/arhancanli/sql-check-mcp

## LinkedIn

A query that looks right and a query the database accepts are different things, and AI agents
usually cannot run their SQL anywhere before it ships. I built SQL Check, an open-source MCP server
that runs SQL on real PostgreSQL and SQLite engines in memory, against your schema and sample
rows, and returns the database's own verdict. https://github.com/arhancanli/sql-check-mcp

## awesome-mcp-servers entry (Databases)

- [arhancanli/sql-check-mcp](https://github.com/arhancanli/sql-check-mcp) 📇 🏠 🍎 🪟 🐧 - Runs SQL on real PostgreSQL 18 (PGlite) and SQLite in memory against your schema and sample rows: the engine's own errors with hints, line and column, constraint violations, results; MySQL/SQL Server syntax advice and PostgreSQL-vs-SQLite portability. No database needed.

## Directory blurbs

- Short: Runs SQL on real PostgreSQL and SQLite in memory: your schema, the database's own errors, results.
- Long: Checks SQL on the real engines, in memory: PostgreSQL 18 (PGlite) and SQLite 3.49 (sql.js), no database server needed. Give your schema (migrations, DDL, sample rows) and the queries: every statement runs inside a transaction that is rolled back, and gets the database's own verdict: its error with line and column, PostgreSQL's hint, constraint violations, and the rows it returns. MySQL and SQL Server syntax that fails is named, with the form each engine accepts. No key, no network.

## Cross-links

Footer: 21 servers, each measured before release: https://github.com/topics/arhancanli-mcp. Related: Actions Check (https://github.com/arhancanli/actions-check-mcp), Citation Check (https://github.com/arhancanli/citation-check-mcp), Config Check (https://github.com/arhancanli/config-check-mcp).
