# Cron Check

<!-- badges:start -->
[![CI](https://github.com/arhancanli/cron-check-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/arhancanli/cron-check-mcp/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/cron-check-mcp)](https://www.npmjs.com/package/cron-check-mcp)
[![downloads](https://img.shields.io/npm/dw/cron-check-mcp)](https://www.npmjs.com/package/cron-check-mcp)
[![OpenSSF Scorecard](https://api.securityscorecards.dev/projects/github.com/arhancanli/cron-check-mcp/badge)](https://scorecard.dev/viewer/?uri=github.com/arhancanli/cron-check-mcp)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
<!-- badges:end -->

Cron is where agents make confident mistakes: `0 0 13 * 5` runs every Friday and every 13th, not
only on Friday the 13th; `*/7` in the minute field leaves a 4-minute gap at the top of each hour;
Quartz and AWS count Sunday as 1 where Unix cron counts it as 0; GitHub Actions never runs a schedule
more often than every 5 minutes. Cron Check answers with the rules of the scheduler in question:

- **Explain and check** up to 20 expressions: plain English, the dialect (detected or given),
  errors with the field that is wrong, the gotchas above, schedules that never fire (February 30),
  and the next runs.
- **Next runs** in any time zone, local and UTC, with runs that fall into a daylight-saving gap or
  repeat flagged, because schedulers treat them differently.
- **Convert** between Unix cron, GitHub Actions, Kubernetes, AWS EventBridge, Quartz and Spring:
  seconds and year fields, the `?` rule, weekdays written as names so the numbering cannot bite.
  What a target cannot express (Unix's day-of-month OR day-of-week in AWS) is refused with the fix.

Runs offline. No key needed.

Built and maintained by [Arhan Canli](https://github.com/arhancanli).

## Install

<!-- install:start -->
[![Install in Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=cron-check&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsImNyb24tY2hlY2stbWNwIl19)
[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install_Server-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=cron-check&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22cron-check-mcp%22%5D%7D)
[![Install in Goose](https://block.github.io/goose/img/extension-install-dark.svg)](https://block.github.io/goose/extension?cmd=npx&arg=-y&arg=cron-check-mcp&id=cron-check&name=Cron%20Check&description=Cron%20expressions%20checked%20instead%20of%20guessed%3A%20a%20plain-English%20explanation%2C%20validation%20with%20the%20gotchas%20that%20bite%20(day-of-month%20OR%20day-of-week%2C%20steps%20that%20do%20not%20divide%20evenly%2C%20dates%20that%20never%20come)%2C%20the%20next%20run%20times%20in%20any%20time%20zone%20with%20daylight-saving%20effects%20noted%2C%20and%20conversion%20between%20Unix%20cron%2C%20GitHub%20Actions%2C%20Kubernetes%2C%20AWS%20EventBridge%2C%20Quartz%20and%20Spring.%20Offline%2C%20no%20key.)

Needs Node.js 20 or newer. No account or key.

**Claude Code**

```sh
claude mcp add cron-check -- npx -y cron-check-mcp
```

**Claude Desktop**: download `cron-check-mcp-<version>.mcpb` from the [latest release](https://github.com/arhancanli/cron-check-mcp/releases/latest) and open it. The bundle is signed; verify it with `gh attestation verify <file> --repo arhancanli/cron-check-mcp`.

**Any other client** (Windsurf, Zed, Cline, Continue and others), in its MCP config file:

```json
{
  "mcpServers": {
    "cron-check": {
      "command": "npx",
      "args": [
        "-y",
        "cron-check-mcp"
      ]
    }
  }
}
```

**Docker**

```sh
docker build -t cron-check-mcp https://github.com/arhancanli/cron-check-mcp.git && docker run -i --rm cron-check-mcp
```

**Hosted (Streamable HTTP)**: `node src/server.mjs --http` serves stateless MCP at `POST /mcp` (port from `PORT`, default 3000).
<!-- install:end -->

## Example

<!-- example:start -->
An agent calls `explain_cron` with:

```json
{
  "expressions": [
    "0 9 * * 1-5",
    "*/7 * * * *",
    "0 0 1 * 1",
    "0 0 30 2 *",
    "cron(0 12 ? * MON-FRI *)",
    "0 0/5 14 * * ?",
    "0 10 ? * 6#3",
    "@daily",
    "61 * * * *",
    "0 0 L * *"
  ]
}
```

and gets back (recorded from the live server on 2026-09-26):

```json
{
  "results": [
    {
      "expression": "0 9 * * 1-5",
      "valid": true,
      "dialect": "unix",
      "description": "At 09:00, Monday through Friday",
      "next_utc": [
        "2026-09-28T09:00:00Z",
        "2026-09-29T09:00:00Z",
        "2026-09-30T09:00:00Z"
      ]
    },
    {
      "expression": "*/7 * * * *",
      "valid": true,
      "dialect": "unix",
      "description": "Every 7 minutes",
      "next_utc": [
        "2026-09-26T17:14:00Z",
        "2026-09-26T17:21:00Z",
        "2026-09-26T17:28:00Z"
      ],
      "warnings": [
        "*/7 in the minute field restarts at 0 each hour, so the last gap is shorter than 7."
      ]
    },
    {
      "expression": "0 0 1 * 1",
      "valid": true,
      "dialect": "unix",
      "description": "At 00:00, on day 1 of the month, and on Monday",
      "next_utc": [
        "2026-09-28T00:00:00Z",
        "2026-10-01T00:00:00Z",
        "2026-10-05T00:00:00Z"
      ],
      "warnings": [
        "Both day fields are restricted, so it runs on days matching either one (day-of-month OR day-of-week), not only days matching both."
      ]
    },
    {
      "expression": "0 0 30 2 *",
      "valid": false,
      "dialect": "unix",
      "description": "At 00:00, on day 30 of the month, only in February",
      "error": "It never fires: no date in the next six years matches (for example February 30)."
    },
    {
      "expression": "cron(0 12 ? * MON-FRI *)",
      "valid": true,
      "dialect": "aws",
      "description": "At 12:00, Monday through Friday",
      "next_utc": [
        "2026-09-28T12:00:00Z",
        "2026-09-29T12:00:00Z",
        "2026-09-30T12:00:00Z"
      ],
      "warnings": [
        "EventBridge cron runs in UTC unless the schedule sets a time zone (EventBridge Scheduler)."
... (44 more lines)
```
<!-- example:end -->

## Tools

<!-- tools:start -->
| Tool | What it does |
| --- | --- |
| `convert_cron` | Rewrites a cron expression for another scheduler (unix, github, kubernetes, aws, quartz, spring): seconds and year fields, ? rules, weekday numbering (written as names). Says why when the target cannot express it. |
| `explain_cron` | Explains up to 20 cron expressions in plain English and checks them: valid or why not, the dialect, gotchas (day-of-month OR day-of-week, uneven steps, GitHub's 5-minute floor), schedules that never fire, and the next 3 runs in UTC. |
| `next_runs` | The next runs of a cron expression in an IANA time zone (default UTC), as local time with weekday and UTC, after a given moment or now. Runs that land in a daylight-saving gap or repeat are flagged, as schedulers differ there. |
<!-- tools:end -->

## How it behaves

- Offline and read-only: no network call at all (`factory.allowHosts` is empty). Descriptions come
  from [cronstrue](https://github.com/bradymholt/cRonstrue) (MIT); parsing, matching and next runs
  from this server's own engine, time zones from Node's ICU database.
- Dialects: `unix` (Vixie cron: two restricted day fields match either one), `github` (UTC, 5-minute
  floor), `kubernetes` (macros, `?` read as `*`), `aws` (EventBridge: six fields with a year, Sunday
  is 1, `?` required in one day field), `quartz` (seconds first, optional year, Sunday is 1), `spring`
  (seconds first, Sunday is 0 or 7). `L`, `W` and `#` are understood where the dialect has them.
- Results are compact JSON with a matching output schema.

## Benchmark

<!-- bench:start -->
Measured 2026-09-26 with gpt-5.4-mini, 10 fixed tasks graded by fixed checks (`bench/tasks.json`, raw results in `bench/results/`).

| Server | Correct | Input tokens | Output tokens | Tool calls | Median time |
| --- | --- | --- | --- | --- | --- |
| This server | 10/10 | 13063 | 485 | 10 | 2.0 s |
| @pipeworx/mcp-crontab, a published cron MCP server | 6/10 | 9967 | 444 | 11 | 1.9 s |
<!-- bench:end -->

## Performance

<!-- perf:start -->
Measured 2026-09-26 from Dubai, home connection against the live upstream, Node 24.19.0 (`bench/perf.json`, `scripts/perf.mjs` in the factory).

| Call | First call | Repeat | Result size |
| --- | --- | --- | --- |
| explain_cron: 10 expressions across dialects | 13 ms | 4 ms | 2,248 chars |
| next_runs: 02:30 daily in New York across the spring-forward change | 8 ms | 0.4 ms | 452 chars |
| convert_cron: weekdays at 09:00 to AWS EventBridge | 4 ms | 0.4 ms | 187 chars |

First call: a fresh server process, including the TLS connection and the upstream's own time. Repeat: the same call again, answered from the in-process cache, so it shows this server's own overhead.

Tool definitions the model reads on every turn (name, description, input schema): 1,872 characters, against 834 for @pipeworx/mcp-crontab, a published cron MCP server. The full tool list, with the output schemas and annotations clients use to validate results, is 3,017 characters (832 for the alternative).
<!-- perf:end -->

## More MCP servers by Arhan Canli

<!-- family:start -->
- [Actions Check](https://github.com/arhancanli/actions-check-mcp): Checks GitHub Actions workflows: outdated actions, old Node runtimes, retired runners, injection.
- [Config Check](https://github.com/arhancanli/config-check-mcp): Validates config files against their official schemas: tsconfig, compose, workflows, 1,400+ more.
- [Dockerfile Check](https://github.com/arhancanli/dockerfile-check-mcp): Checks Dockerfiles: build-breaking mistakes, base image tags that exist, digests, platforms, EOL.
- [Domain Health](https://github.com/arhancanli/domain-health-mcp): Email and domain checks: SPF lookup limits, DKIM keys, DMARC, DNS records, registration expiry.
- [End of Life](https://github.com/arhancanli/end-of-life-mcp): Is this version still supported? EOL dates, latest patch and upgrade target for 470+ products.
- [Internet Standards](https://github.com/arhancanli/internet-standards-mcp): RFC sections, status, obsoleted-by chains, errata and IANA registries for coding agents.
- [Kube Check](https://github.com/arhancanli/kube-check-mcp): Checks Kubernetes manifests for your version: removed APIs, unknown fields, Pod Security, risks.
- [License Check](https://github.com/arhancanli/license-check-mcp): Open source license answers: SPDX ids, copyleft, and whether a dependency's license fits yours.
- [The whole collection](https://github.com/arhancanli/mcp-factory#servers), 12 more
<!-- family:end -->

## License

MIT, Copyright (c) 2026 Arhan Canli.
