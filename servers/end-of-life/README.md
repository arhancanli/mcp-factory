# End of Life

<!-- badges:start -->
[![CI](https://github.com/arhancanli/end-of-life-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/arhancanli/end-of-life-mcp/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/end-of-life-mcp)](https://www.npmjs.com/package/end-of-life-mcp)
[![downloads](https://img.shields.io/npm/dw/end-of-life-mcp)](https://www.npmjs.com/package/end-of-life-mcp)
[![OpenSSF Scorecard](https://api.securityscorecards.dev/projects/github.com/arhancanli/end-of-life-mcp/badge)](https://scorecard.dev/viewer/?uri=github.com/arhancanli/end-of-life-mcp)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
<!-- badges:end -->

Is this version still supported? End of Life reads a project's Dockerfile, version files,
manifests and CI workflows, finds every runtime, database and OS version it pins, and says for each:
still supported, security fixes only, paid extended support only, or end of life, with the dates,
the days left, the latest patch, the newest version to move to, and the smallest jump that still
gets fixes.

Coding agents pick versions from memory: they write `FROM node:18` or `python-version: "3.8"`
years after those stopped getting security fixes. This server answers from
[endoflife.date](https://endoflife.date) (470+ products) and finds versions where they hide:
`python:3.8-slim-bullseye` is Python 3.8 on Debian 11, `node:18-alpine3.17` carries Alpine 3.17,
`.nvmrc` may say `lts/hydrogen` (Node.js 18), `runs-on: ubuntu-20.04` pins an OS.

| Status | Meaning |
| --- | --- |
| `supported` | Regular fixes |
| `security_only` | Active support ended; security fixes continue |
| `extended_only` | End of life for most users; paid extended support continues |
| `end_of_life` | No fixes of any kind |
| `upcoming` | Not released yet |

Status is computed from the dates on the day you ask, not from stored flags. For a range
(`>=3.8`, `^18.12`), the lowest version it allows is checked: it is the oldest version the project
still promises to run on.

No account or key needed. Built and maintained by [Arhan Canli](https://github.com/arhancanli).

## Install

<!-- install:start -->
[![Install in Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=end-of-life&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsImVuZC1vZi1saWZlLW1jcCJdfQ%3D%3D)
[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install_Server-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=end-of-life&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22end-of-life-mcp%22%5D%7D)
[![Install in Goose](https://block.github.io/goose/img/extension-install-dark.svg)](https://block.github.io/goose/extension?cmd=npx&arg=-y&arg=end-of-life-mcp&id=end-of-life&name=End%20of%20Life&description=Tells%20coding%20agents%20whether%20a%20runtime%2C%20framework%2C%20database%20or%20OS%20version%20is%20still%20supported%3A%20end-of-life%20and%20security-support%20dates%2C%20days%20left%2C%20the%20latest%20patch%20and%20the%20version%20to%20upgrade%20to%2C%20for%20470%2B%20products%2C%20straight%20from%20a%20project's%20Dockerfile%2C%20.nvmrc%2C%20package.json%2C%20pyproject.toml%2C%20go.mod%20and%20CI%20files.)

Needs Node.js 20 or newer. No account or key.

**Claude Code**

```sh
claude mcp add end-of-life -- npx -y end-of-life-mcp
```

**Claude Desktop**: download `end-of-life-mcp-<version>.mcpb` from the [latest release](https://github.com/arhancanli/end-of-life-mcp/releases/latest) and open it. The bundle is signed; verify it with `gh attestation verify <file> --repo arhancanli/end-of-life-mcp`.

**Any other client** (Windsurf, Zed, Cline, Continue and others), in its MCP config file:

```json
{
  "mcpServers": {
    "end-of-life": {
      "command": "npx",
      "args": [
        "-y",
        "end-of-life-mcp"
      ]
    }
  }
}
```

**Docker**

```sh
docker build -t end-of-life-mcp https://github.com/arhancanli/end-of-life-mcp.git && docker run -i --rm end-of-life-mcp
```

**Hosted (Streamable HTTP)**: `node src/server.mjs --http` serves stateless MCP at `POST /mcp` (port from `PORT`, default 3000).
<!-- install:end -->

## Example

<!-- example:start -->
An agent calls `check_project` with:

```json
{
  "files": [
    {
      "path": "Dockerfile",
      "content": "FROM node:18-alpine3.17 AS build\nFROM python:3.8-slim-bullseye\n"
    },
    {
      "path": ".nvmrc",
      "content": "lts/hydrogen\n"
    },
    {
      "path": ".github/workflows/ci.yml",
      "content": "jobs:\n  test:\n    runs-on: ubuntu-20.04\n    strategy:\n      matrix:\n        node: [20, 22, 24]\n"
    },
    {
      "path": "pyproject.toml",
      "content": "[project]\nrequires-python = \">=3.10\"\n"
    },
    {
      "path": "README.md",
      "content": "hello"
    }
  ]
}
```

and gets back (recorded from the live server on 2026-09-26):

```json
{
  "counts": {
    "end_of_life": 5,
    "extended_only": 2,
    "security_only": 2,
    "supported": 1
  },
  "results": [
    {
      "product": "nodejs",
      "version": "18",
      "cycle": "18",
      "status": "end_of_life",
      "lts": true,
      "eol": "2025-04-30",
      "active_until": "2023-10-18",
      "latest": "18.20.8",
      "link": "https://endoflife.date/nodejs",
      "upgrade_to": {
        "cycle": "24",
        "latest": "24.21.0",
        "lts": true
      },
      "nearest_supported": {
        "cycle": "22",
        "latest": "22.23.3",
        "eol": "2027-04-30"
      },
      "file": "Dockerfile",
      "line": 1,
      "found": "FROM node:18-alpine3.17 AS build"
    },
    {
      "product": "alpine-linux",
      "version": "3.17",
      "cycle": "3.17",
      "status": "end_of_life",
      "eol": "2024-11-22",
      "latest": "3.17.10",
      "link": "https://endoflife.date/alpine-linux",
      "upgrade_to": {
        "cycle": "3.24",
        "latest": "3.24.2"
      },
      "nearest_supported": {
        "cycle": "3.21",
        "latest": "3.21.8",
        "eol": "2026-11-01"
      },
      "file": "Dockerfile",
      "line": 1,
      "found": "FROM node:18-alpine3.17 AS build"
    },
    {
      "product": "python",
      "version": "3.8",
      "cycle": "3.8",
      "status": "end_of_life",
      "eol": "2024-10-07",
      "active_until": "2021-05-03",
... (176 more lines)
```
<!-- example:end -->

## Tools

<!-- tools:start -->
| Tool | What it does |
| --- | --- |
| `check_project` | Finds the runtime, database and OS versions a project pins in its files (Dockerfile, .nvmrc, .node-version, .python-version, .ruby-version, runtime.txt, .tool-versions, package.json, pyproject.toml, go.mod, composer.json, Gemfile, global.json and GitHub Actions workflows) and checks each against endoflife.date, with file and line. Pass each file's path and text. |
| `check_versions` | Checks up to 50 'product version' pairs (python 3.8, node@18, postgres:13, ubuntu 20.04, django 4.2) against endoflife.date: status (supported, security_only, extended_only, end_of_life, upcoming), end-of-life date, days left, latest patch and the version to upgrade to. Worst first. |
| `product_lifecycle` | Every maintained release cycle of a product (and the most recent ended ones) with status, release, end-of-active-support and end-of-life dates, LTS flag and latest patch, plus the recommended upgrade target. |
<!-- tools:end -->

Files `check_project` reads: Dockerfile and Containerfile (`FROM` lines, including the OS in tags
such as `-alpine3.19` and `-bookworm`), `.nvmrc`, `.node-version`, `.python-version`,
`.ruby-version`, `runtime.txt`, `.tool-versions`, `package.json` (`engines`, `volta`),
`pyproject.toml` (`requires-python`, Poetry), `go.mod` (`go`, `toolchain`), `composer.json`,
`Gemfile`, `global.json` and GitHub Actions workflows (`setup-*` versions, matrices, `runs-on`).

## How it behaves

- Read-only: no tool changes anything outside this process; files are read as text, never run.
- Network: HTTPS only, to the hosts listed in `package.json` under `factory.allowHosts`, with a
  deadline, a size cap and bounded retries; a stalled read is retried. Nothing else is contacted, and
  nothing is logged except unexpected failures (to stderr, without your inputs).
- Answers are cached for 12 hours.
- Results are compact JSON with a matching output schema, worst status first.

## Benchmark

<!-- bench:start -->
Measured 2026-09-26 with gpt-5.4-mini, 10 fixed tasks graded by fixed checks (`bench/tasks.json`, raw results in `bench/results/`).

| Server | Correct | Input tokens | Output tokens | Tool calls | Median time |
| --- | --- | --- | --- | --- | --- |
| This server | 10/10 | 13453 | 321 | 10 | 2.1 s |
| endoflife-mcp, the only published end-of-life server | 9/10 | 97050 | 398 | 14 | 2.7 s |
<!-- bench:end -->

## Performance

<!-- perf:start -->
Measured 2026-09-26 from Dubai, home connection against the live upstream, Node 24.19.0 (`bench/perf.json`, `scripts/perf.mjs` in the factory).

| Call | First call | Repeat | Result size |
| --- | --- | --- | --- |
| check_project: Dockerfile, .nvmrc, a CI workflow, pyproject | 1853 ms | 2.6 ms | 3,869 chars |
| check_versions: 6 named versions | 2154 ms | 3.1 ms | 1,694 chars |
| product_lifecycle: Node.js | 892 ms | 1.2 ms | 997 chars |

First call: a fresh server process, including the TLS connection and the upstream's own time. Repeat: the same call again, answered from the in-process cache, so it shows this server's own overhead.

Tool definitions the model reads on every turn (name, description, input schema): 1,706 characters, against 6,734 for endoflife-mcp, the only published end-of-life server. The full tool list, with the output schemas and annotations clients use to validate results, is 3,165 characters (8,958 for the alternative).
<!-- perf:end -->

## Data sources

- [endoflife.date](https://endoflife.date), the community-maintained end-of-life database
  (MIT-licensed). Confirm dates that matter commercially with the vendor.

## More MCP servers by Arhan Canli

<!-- family:start -->
- [Actions Check](https://github.com/arhancanli/actions-check-mcp): Checks GitHub Actions workflows: outdated actions, old Node runtimes, retired runners, injection.
- [Cron Check](https://github.com/arhancanli/cron-check-mcp): Explains cron expressions, lists next run times in any time zone, converts between cron dialects.
- [Domain Health](https://github.com/arhancanli/domain-health-mcp): Email and domain checks: SPF lookup limits, DKIM keys, DMARC, DNS records, registration expiry.
- [Internet Standards](https://github.com/arhancanli/internet-standards-mcp): RFC sections, status, obsoleted-by chains, errata and IANA registries for coding agents.
- [License Check](https://github.com/arhancanli/license-check-mcp): Open source license answers: SPDX ids, copyleft, and whether a dependency's license fits yours.
- [Package Truth](https://github.com/arhancanli/package-truth-mcp): Checks packages exist before install: version, deprecation, vulnerabilities, licence. 7 ecosystems.
- [Release Notes](https://github.com/arhancanli/release-notes-mcp): What changed between two versions of a package: breaking changes, deprecations, security fixes.
- [Citation Check](https://github.com/arhancanli/citation-check-mcp): Verifies citations: finds fabricated or mismatched references and retractions, returns clean BibTeX.
- [The whole collection](https://github.com/arhancanli/mcp-factory#servers), 7 more
<!-- family:end -->

## License

MIT, Copyright (c) 2026 Arhan Canli.
