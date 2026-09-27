# SQL Check

<!-- badges:start -->
[![CI](https://github.com/arhancanli/sql-check-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/arhancanli/sql-check-mcp/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/sql-check-mcp)](https://www.npmjs.com/package/sql-check-mcp)
[![downloads](https://img.shields.io/npm/dw/sql-check-mcp)](https://www.npmjs.com/package/sql-check-mcp)
[![OpenSSF Scorecard](https://api.securityscorecards.dev/projects/github.com/arhancanli/sql-check-mcp/badge)](https://scorecard.dev/viewer/?uri=github.com/arhancanli/sql-check-mcp)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
<!-- badges:end -->

Agents write SQL for databases they cannot reach, so they guess: whether PostgreSQL accepts a
`GROUP BY`, what a column is called, whether `DATE_SUB` exists, what `round(2.5)` returns. SQL Check
stops the guessing. It runs your SQL on the real engines, in memory: PostgreSQL 18 (PGlite, the
PostgreSQL server compiled to WebAssembly) and SQLite 3.49 (sql.js). No database server, no network.

- **Your schema first**: CREATE TABLE statements, migrations, sample rows. Then each statement gets
  the engine's own verdict: the error with its line and column and PostgreSQL's hint ("Perhaps you
  meant to reference the column users.email"), the constraint it violates with the failing row, or
  the rows it returns.
- **Every statement is checked**, not just the first: each runs in its own savepoint inside one
  transaction that is rolled back, so an error does not hide the next one and nothing persists.
- **SQL from other databases**: when MySQL or SQL Server syntax fails (backticks, `DATE_SUB`,
  `LIMIT 0, 10`, `AUTO_INCREMENT`, `TOP n`), the error says what the engine accepts instead.
- **Portability**: `dialect: both` runs the SQL on PostgreSQL and SQLite and lists where they
  disagree, including the quiet differences: SQLite fills an `INTEGER PRIMARY KEY` by itself and
  does not enforce foreign keys unless asked; PostgreSQL does neither and does.

No key needed.

Built and maintained by [Arhan Canli](https://github.com/arhancanli).

## Install

<!-- install:start -->
[![Install in Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=sql-check&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsInNxbC1jaGVjay1tY3AiXX0%3D)
[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install_Server-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=sql-check&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22sql-check-mcp%22%5D%7D)
[![Install in Goose](https://block.github.io/goose/img/extension-install-dark.svg)](https://block.github.io/goose/extension?cmd=npx&arg=-y&arg=sql-check-mcp&id=sql-check&name=SQL%20Check&description=Checks%20SQL%20on%20the%20real%20engines%2C%20in%20memory%3A%20PostgreSQL%2018%20(PGlite)%20and%20SQLite%203.49%20(sql.js)%2C%20no%20database%20server%20needed.%20Give%20your%20schema%20(migrations%2C%20DDL%2C%20sample%20rows)%20and%20the%20queries%3A%20every%20statement%20runs%20inside%20a%20transaction%20that%20is%20rolled%20back%2C%20and%20gets%20the%20database's%20own%20verdict%3A%20its%20error%20with%20line%20and%20column%2C%20PostgreSQL's%20hint%2C%20constraint%20violations%2C%20and%20the%20rows%20it%20returns.%20MySQL%20and%20SQL%20Server%20syntax%20that%20fails%20is%20named%2C%20with%20the%20form%20each%20engine%20accepts.%20No%20key%2C%20no%20network.)

Needs Node.js 20 or newer. No account or key.

**Claude Code**

```sh
claude mcp add sql-check -- npx -y sql-check-mcp
```

**Claude Desktop**: download `sql-check-mcp-<version>.mcpb` from the [latest release](https://github.com/arhancanli/sql-check-mcp/releases/latest) and open it. The bundle is signed; verify it with `gh attestation verify <file> --repo arhancanli/sql-check-mcp`.

**Any other client** (Windsurf, Zed, Cline, Continue and others), in its MCP config file:

```json
{
  "mcpServers": {
    "sql-check": {
      "command": "npx",
      "args": [
        "-y",
        "sql-check-mcp"
      ]
    }
  }
}
```

**Docker**

```sh
docker build -t sql-check-mcp https://github.com/arhancanli/sql-check-mcp.git && docker run -i --rm sql-check-mcp
```

**Hosted (Streamable HTTP)**: `node src/server.mjs --http` serves stateless MCP at `POST /mcp` (port from `PORT`, default 3000).
<!-- install:end -->

## Example

<!-- example:start -->
An agent calls `check_sql` with:

```json
{
  "schema": "CREATE TABLE users (\n  id serial PRIMARY KEY,\n  email text NOT NULL UNIQUE,\n  created_at timestamptz DEFAULT now()\n);\nCREATE TABLE orders (\n  id serial PRIMARY KEY,\n  user_id int NOT NULL REFERENCES users(id),\n  total numeric(10,2) NOT NULL,\n  status text NOT NULL CHECK (status IN ('open', 'paid'))\n);\nINSERT INTO users (email) VALUES ('ana@example.com'), ('ben@example.com');\nINSERT INTO orders (user_id, total, status) VALUES (1, 10.50, 'open'), (1, 3.00, 'paid');\n",
  "sql": "-- spend per user\nSELECT u.email, sum(o.total) AS spent\nFROM users u LEFT JOIN orders o ON o.user_id = u.id\nGROUP BY u.email\nORDER BY u.email;\nSELECT u.email, o.total FROM users u JOIN orders o ON o.user_id = u.id GROUP BY u.email;\nSELECT emial FROM users;\nSELECT * FROM orders WHERE placed_at > DATE_SUB(NOW(), INTERVAL 7 DAY);\nINSERT INTO orders (user_id, total, status) VALUES (1, 5.00, 'shipped');\nINSERT INTO orders (user_id, total, status) VALUES (9, 5.00, 'open');\nUPDATE orders SET status = 'paid' WHERE status = 'open' RETURNING id, status;\n"
}
```

and gets back (recorded from the live server on 2026-09-27):

```json
{
  "results": [
    {
      "dialect": "postgres",
      "version": "PostgreSQL 18.3",
      "counts": {
        "ok": 2,
        "error": 5
      },
      "statements": [
        {
          "line": 2,
          "sql": "SELECT u.email, sum(o.total) AS spent FROM users u LEFT JOIN orders o ON o.user_id = u.id GROUP B...",
          "status": "ok",
          "command": "SELECT",
          "columns": [
            "email text",
            "spent numeric"
          ],
          "row_count": 2,
          "rows": [
            [
              "ana@example.com",
              "13.50"
            ],
            [
              "ben@example.com",
              null
            ]
          ]
        },
        {
          "line": 6,
          "sql": "SELECT u.email, o.total FROM users u JOIN orders o ON o.user_id = u.id GROUP BY u.email",
          "status": "error",
          "column": 17,
          "error": "column \"o.total\" must appear in the GROUP BY clause or be used in an aggregate function",
          "code": "42803"
        },
        {
          "line": 7,
          "sql": "SELECT emial FROM users",
          "status": "error",
          "column": 8,
          "error": "column \"emial\" does not exist",
          "hint": "Perhaps you meant to reference the column \"users.email\".",
          "code": "42703"
        },
        {
          "line": 8,
          "sql": "SELECT * FROM orders WHERE placed_at > DATE_SUB(NOW(), INTERVAL 7 DAY)",
          "status": "error",
          "column": 65,
          "error": "syntax error at or near \"7\"",
          "code": "42601",
          "advice": "DATE_SUB/DATE_ADD are MySQL; PostgreSQL writes now() - interval '1 day'"
        },
        {
          "line": 9,
          "sql": "INSERT INTO orders (user_id, total, status) VALUES (1, 5.00, 'shipped')",
... (35 more lines)
```
<!-- example:end -->

## Tools

<!-- tools:start -->
| Tool | What it does |
| --- | --- |
| `check_sql` | Runs SQL on real PostgreSQL 18 or SQLite 3.49 in memory, after your schema (DDL, migrations, sample INSERTs). Each statement gets the engine's verdict: error with line, column and hint, constraint violations, or the rows it returns (up to max_rows). All inside a rolled-back transaction. dialect both compares the two. |
<!-- tools:end -->

## How it behaves

- Nothing leaves your machine: the engines run inside this process, in memory, with in-memory file
  systems; there is no network access at all (`factory.allowHosts` is empty).
- Each call starts from an empty database. PostgreSQL runs every statement in its own savepoint
  inside one transaction that is rolled back, then discards the session; SQLite gets a new
  database per call. Statements that would end that transaction (`BEGIN`, `COMMIT`, `ROLLBACK`)
  are skipped and say so.
- The engines run in a worker thread with a time limit (10 s per call, `SQL_CHECK_TIMEOUT_MS` to
  change it): a statement that never ends is stopped, reported with its number, and the engine is
  replaced. They start in the background when the server starts, so the first call does not wait
  for PostgreSQL to boot.
- Results are compact JSON with a matching output schema: up to `max_rows` rows per statement
  (default 20, with the full count), long values cut at 200 characters, bigints as strings.

## Benchmark

<!-- bench:start -->
Not yet measured.
<!-- bench:end -->

## Performance

<!-- perf:start -->
Measured 2026-09-27 from Dubai, home connection against the live upstream, Node 24.19.0 (`bench/perf.json`, `scripts/perf.mjs` in the factory).

| Call | First call | Repeat | Result size |
| --- | --- | --- | --- |
| check_sql: eight statements against a schema with sample rows, on PostgreSQL | 827 ms | 7.7 ms | 1,855 chars |
| check_sql: the same SQL on PostgreSQL and SQLite, compared | 825 ms | 4.1 ms | 1,918 chars |
| check_sql: a migration step that cannot run inside a transaction | 892 ms | 2.9 ms | 692 chars |

First call: a fresh server process, including the TLS connection and the upstream's own time. Repeat: the same call again, answered from the in-process cache, so it shows this server's own overhead.

Tool definitions the model reads on every turn (name, description, input schema): 800 characters. The full tool list, with the output schemas and annotations clients use to validate results, is 1,357 characters.
<!-- perf:end -->

## More MCP servers by Arhan Canli

<!-- family:start -->
- [Actions Check](https://github.com/arhancanli/actions-check-mcp): Checks GitHub Actions workflows: outdated actions, old Node runtimes, retired runners, injection.
- [Config Check](https://github.com/arhancanli/config-check-mcp): Validates config files against their official schemas: tsconfig, compose, workflows, 1,400+ more.
- [Cron Check](https://github.com/arhancanli/cron-check-mcp): Explains cron expressions, lists next run times in any time zone, converts between cron dialects.
- [Dockerfile Check](https://github.com/arhancanli/dockerfile-check-mcp): Checks Dockerfiles: build-breaking mistakes, base image tags that exist, digests, platforms, EOL.
- [Domain Health](https://github.com/arhancanli/domain-health-mcp): Email and domain checks: SPF lookup limits, DKIM keys, DMARC, DNS records, registration expiry.
- [End of Life](https://github.com/arhancanli/end-of-life-mcp): Is this version still supported? EOL dates, latest patch and upgrade target for 470+ products.
- [Internet Standards](https://github.com/arhancanli/internet-standards-mcp): RFC sections, status, obsoleted-by chains, errata and IANA registries for coding agents.
- [Kube Check](https://github.com/arhancanli/kube-check-mcp): Checks Kubernetes manifests for your version: removed APIs, unknown fields, Pod Security, risks.
- [The whole collection](https://github.com/arhancanli/mcp-factory#servers), 12 more
<!-- family:end -->

## License

MIT, Copyright (c) 2026 Arhan Canli.
