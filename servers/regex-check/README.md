# Regex Check

<!-- badges:start -->
[![CI](https://github.com/arhancanli/regex-check-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/arhancanli/regex-check-mcp/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/regex-check-mcp)](https://www.npmjs.com/package/regex-check-mcp)
[![downloads](https://img.shields.io/npm/dw/regex-check-mcp)](https://www.npmjs.com/package/regex-check-mcp)
[![OpenSSF Scorecard](https://api.securityscorecards.dev/projects/github.com/arhancanli/regex-check-mcp/badge)](https://scorecard.dev/viewer/?uri=github.com/arhancanli/regex-check-mcp)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
<!-- badges:end -->

A regular expression means different things to different engines, and agents write them as if
it did not: `(?P<name>...)` is Python and refused by JavaScript, lookbehind is refused by Go and RE2,
`\d` matches Arabic-Indic digits in Python and not in JavaScript, `^abc$` matches `"abc\n"` in
Python and PHP and not in JavaScript, and `^(a+)+$` hangs a server on one crafted input. Regex
Check runs the pattern on the real engines, in process:

- **JavaScript** (V8), **Python** (CPython's `re`, through Pyodide), **PCRE2** 10.48 (PHP's
  `preg_*`, `grep -P`, nginx) and **RE2** (the syntax Go's `regexp` and BigQuery accept).
- Each engine's own verdict: its compile error with the position, or every match with its groups
  and named groups, and the result of a replacement written in that engine's syntax. Positions are
  counted in characters for all four, and the report lists where the engines disagree.
- **ReDoS**: whether a pattern can be made to backtrack catastrophically, exponential or polynomial,
  the part to blame marked in the pattern, an attack string, and how long each engine actually
  took on it.

Offline, no key.

Built and maintained by [Arhan Canli](https://github.com/arhancanli).

## Install

<!-- install:start -->
[![Install in Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=regex-check&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsInJlZ2V4LWNoZWNrLW1jcCJdfQ%3D%3D)
[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install_Server-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=regex-check&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22regex-check-mcp%22%5D%7D)
[![Install in Goose](https://block.github.io/goose/img/extension-install-dark.svg)](https://block.github.io/goose/extension?cmd=npx&arg=-y&arg=regex-check-mcp&id=regex-check&name=Regex%20Check&description=Tests%20regular%20expressions%20on%20the%20real%20engines%2C%20in%20process%3A%20JavaScript%20(V8)%2C%20Python%20(CPython's%20re%2C%20via%20Pyodide)%2C%20PCRE2%2010.48%20(PHP%2C%20grep%20-P%2C%20nginx)%20and%20RE2%20(Go%2C%20BigQuery).%20Each%20engine%20gives%20its%20own%20verdict%3A%20compile%20errors%20with%20position%2C%20every%20match%20with%20its%20groups%20and%20named%20groups%2C%20and%20the%20result%20of%20a%20replacement%3B%20differences%20between%20engines%20are%20listed.%20Finds%20catastrophic%20backtracking%20(ReDoS)%20with%20an%20attack%20string%20and%20confirms%20it%20by%20timing%20the%20backtracking%20engines.%20Offline%2C%20no%20key.)

Needs Node.js 20 or newer. No account or key.

**Claude Code**

```sh
claude mcp add regex-check -- npx -y regex-check-mcp
```

**Claude Desktop**: download `regex-check-mcp-<version>.mcpb` from the [latest release](https://github.com/arhancanli/regex-check-mcp/releases/latest) and open it. The bundle is signed; verify it with `gh attestation verify <file> --repo arhancanli/regex-check-mcp`.

**Any other client** (Windsurf, Zed, Cline, Continue and others), in its MCP config file:

```json
{
  "mcpServers": {
    "regex-check": {
      "command": "npx",
      "args": [
        "-y",
        "regex-check-mcp"
      ]
    }
  }
}
```

**Docker**

```sh
docker build -t regex-check-mcp https://github.com/arhancanli/regex-check-mcp.git && docker run -i --rm regex-check-mcp
```

**Hosted (Streamable HTTP)**: `node src/server.mjs --http` serves stateless MCP at `POST /mcp` (port from `PORT`, default 3000).
<!-- install:end -->

## Example

<!-- example:start -->
An agent calls `test_regex` with:

```json
{
  "pattern": "(?P<year>\\d{4})-(\\d{2})",
  "inputs": [
    "on 2026-09",
    "٢٠٢٦-٠٩ and 1999-12"
  ],
  "replacement": "\\2/\\1"
}
```

and gets back (recorded from the live server on 2026-09-27):

```json
{
  "engines": [
    {
      "flavor": "javascript",
      "engine": "V8 13.6.233.17-node.51 (Node v24.19.0)",
      "error": {
        "message": "Invalid group"
      }
    },
    {
      "flavor": "python",
      "engine": "CPython 3.14.2 re (Pyodide)",
      "results": [
        {
          "matches": [
            {
              "index": 3,
              "text": "2026-09",
              "groups": [
                "2026",
                "09"
              ],
              "named": {
                "year": "2026"
              }
            }
          ],
          "match_count": 1,
          "replaced": "on 09/2026"
        },
        {
          "matches": [
            {
              "index": 0,
              "text": "٢٠٢٦-٠٩",
              "groups": [
                "٢٠٢٦",
                "٠٩"
              ],
              "named": {
                "year": "٢٠٢٦"
              }
            },
            {
              "index": 12,
              "text": "1999-12",
              "groups": [
                "1999",
                "12"
              ],
              "named": {
                "year": "1999"
              }
            }
          ],
          "match_count": 2,
          "replaced": "٠٩/٢٠٢٦ and 12/1999"
        }
      ]
    },
... (89 more lines)
```
<!-- example:end -->

## Tools

<!-- tools:start -->
| Tool | What it does |
| --- | --- |
| `check_redos` | Checks a regex for catastrophic backtracking (ReDoS): safe or vulnerable, exponential or polynomial, the part of the pattern to blame, an attack string, and how long each real engine (JavaScript, Python, PCRE2, RE2) takes on it. Use before a pattern runs on untrusted input. |
| `test_regex` | Runs a regex on real engines: JavaScript (V8), Python (CPython re), PCRE2 (PHP, grep -P), RE2 (Go, BigQuery). Each gives its compile error with position, or every match with groups and named groups, and the replacement result in its own syntax. Positions are in characters. Lists where engines disagree. |
<!-- tools:end -->

## How it behaves

- Nothing leaves your machine and there is no network access (`factory.allowHosts` is empty): the
  engines are compiled to WebAssembly (Python, PCRE2, RE2) or are Node's own (JavaScript).
- Each engine runs in its own worker thread with a time limit (5 s per call,
  `REGEX_CHECK_TIMEOUT_MS` to change it): a pattern that backtracks forever on an input stops that
  engine only, which is replaced, and the others still answer. The engines start in the background
  when the server starts, so the first call does not wait for Python to load.
- PCRE2 runs in UTF mode, as PHP's `/u` modifier uses it, with its default match limit. RE2 takes
  JavaScript-style `$1` replacements, as Go's `ReplaceAllString` does. Up to 10,000 matches are
  counted per input and `max_matches` (default 20) are listed.
- The ReDoS analysis is [recheck](https://github.com/makenowjust-labs/recheck) (MIT), which proves a
  problem by building an attack string; the attack is then timed on each engine for 2 seconds.
- Results are compact JSON with a matching output schema.

## Benchmark

<!-- bench:start -->
Not yet measured.
<!-- bench:end -->

## Performance

<!-- perf:start -->
Measured 2026-09-27 from Dubai, home connection against the live upstream, Node 24.19.0 (`bench/perf.json`, `scripts/perf.mjs` in the factory).

| Call | First call | Repeat | Result size |
| --- | --- | --- | --- |
| test_regex: Python-style named groups and \d across four engines | 983 ms | 3.8 ms | 1,576 chars |
| test_regex: a lookbehind, which RE2 refuses | 859 ms | 0.6 ms | 750 chars |
| check_redos: nested repetition, measured on the engines | 2991 ms | 0.3 ms | 915 chars |
| check_redos: an email pattern that is safe | 68 ms | 0.3 ms | 128 chars |

First call: a fresh server process, including the TLS connection and the upstream's own time. Repeat: the same call again, answered from the in-process cache, so it shows this server's own overhead.

Tool definitions the model reads on every turn (name, description, input schema): 1,490 characters, against 1,251 for @jkumonpm/regex-tester-mcp, a published regex MCP server (JavaScript engine only). The full tool list, with the output schemas and annotations clients use to validate results, is 2,124 characters (1,439 for the alternative).
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
