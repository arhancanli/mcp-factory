# Release Notes

<!-- badges:start -->
[![CI](https://github.com/arhancanli/release-notes-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/arhancanli/release-notes-mcp/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/release-notes-mcp)](https://www.npmjs.com/package/release-notes-mcp)
[![downloads](https://img.shields.io/npm/dw/release-notes-mcp)](https://www.npmjs.com/package/release-notes-mcp)
[![OpenSSF Scorecard](https://api.securityscorecards.dev/projects/github.com/arhancanli/release-notes-mcp/badge)](https://scorecard.dev/viewer/?uri=github.com/arhancanli/release-notes-mcp)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
<!-- badges:end -->

What breaks if I upgrade? Coding agents answer upgrade questions from memory, and memory is where
"express 5 removed req.param() in 5.0.0" (it was 5.0.0-alpha.2) and "requests 2.32 is a drop-in
update" (it dropped Python 3.7) come from. Release Notes answers from the package's own changelog:

- **Before an upgrade**, `changes_between` lists the breaking changes, removals, deprecations,
  security fixes and raised requirements (Node.js, Python...) between two versions, each tagged with
  its version, and says which major versions you cross. Pre-release notes count toward the release
  they lead to, which is where most breaking changes are written down.
- **When did it change?** `search_changelog` finds every version whose notes mention an API or
  option, oldest first, with the section it was listed under ("remove", "deprecations").
- **One version's notes**, cleaned of commit hashes and pull-request noise.

Notes come from the CHANGELOG file (a monorepo package's own first; Markdown, underlined and
reStructuredText formats), or from GitHub releases when there is no file, or the file covers only
the newest major. npm, PyPI, crates.io, Go, Maven and NuGet. No key needed; a `GITHUB_TOKEN` raises
GitHub's limit of 60 anonymous API requests an hour.

Built and maintained by [Arhan Canli](https://github.com/arhancanli).

## Install

<!-- install:start -->
[![Install in Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=release-notes&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsInJlbGVhc2Utbm90ZXMtbWNwIl19)
[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install_Server-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=release-notes&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22release-notes-mcp%22%5D%7D)
[![Install in Goose](https://block.github.io/goose/img/extension-install-dark.svg)](https://block.github.io/goose/extension?cmd=npx&arg=-y&arg=release-notes-mcp&id=release-notes&name=Release%20Notes&description=Answers%20upgrade%20questions%20from%20a%20package's%20own%20changelog%20or%20GitHub%20releases%3A%20what%20changed%20between%20two%20versions%2C%20with%20breaking%20changes%2C%20deprecations%2C%20security%20fixes%20and%20raised%20requirements%20pulled%20out%20first%3B%20the%20notes%20for%20one%20version%3B%20and%20the%20version%20where%20something%20was%20added%2C%20deprecated%20or%20removed.%20npm%2C%20PyPI%2C%20crates.io%2C%20RubyGems%2C%20Go%20and%20Packagist.%20No%20key.)

Needs Node.js 20 or newer. No account or key.

**Claude Code**

```sh
claude mcp add release-notes -- npx -y release-notes-mcp
```

**Claude Desktop**: download `release-notes-mcp-<version>.mcpb` from the [latest release](https://github.com/arhancanli/release-notes-mcp/releases/latest) and open it. The bundle is signed; verify it with `gh attestation verify <file> --repo arhancanli/release-notes-mcp`.

**Any other client** (Windsurf, Zed, Cline, Continue and others), in its MCP config file:

```json
{
  "mcpServers": {
    "release-notes": {
      "command": "npx",
      "args": [
        "-y",
        "release-notes-mcp"
      ]
    }
  }
}
```

**Docker**

```sh
docker build -t release-notes-mcp https://github.com/arhancanli/release-notes-mcp.git && docker run -i --rm release-notes-mcp
```

**Hosted (Streamable HTTP)**: `node src/server.mjs --http` serves stateless MCP at `POST /mcp` (port from `PORT`, default 3000).
<!-- install:end -->

## Example

<!-- example:start -->
An agent calls `changes_between` with:

```json
{
  "ecosystem": "npm",
  "package": "express",
  "from": "4.21.2",
  "to": "5.0.0"
}
```

and gets back (recorded from the live server on 2026-09-26):

```json
{
  "versions": 5,
  "major_upgrades": [
    "5.x"
  ],
  "from_date": "2024-12-05",
  "to_date": "2024-09-10",
  "breaking": [
    "5.0.0: `res.status()` accepts only integers, and input must be greater than 99 and less than 1000",
    "5.0.0: will throw a `RangeError: Invalid status code: ${code}. Status code must be greater than 99 and less than 1000.` for inputs outside this range",
    "5.0.0: will throw a `TypeError: Invalid status code: ${code}. Status code must be an integer.` for non integer inputs"
  ],
  "removed": [
    "5.0.0: `path-is-absolute` dependency - use `path.isAbsolute` instead",
    "5.0.0-beta.1: Named matching groups no longer available by position in `req.params`",
    "5.0.0-beta.1: Remove `debug` dependency",
    "5.0.0-beta.1: Remove `hidden` option; use `dotfiles` option instead",
    "5.0.0-beta.1: Remove `express.static.mime` export; use `mime-types` package instead",
    "5.0.0-alpha.7: `path-to-regexp` dependency",
    "5.0.0-alpha.7: Remove `DEBUG_FD` environment variable support",
    "5.0.0-alpha.6: `res.redirect(url, status)` signature - use `res.redirect(status, url)`",
    "5.0.0-alpha.6: `res.send(status, body)` signature - use `res.status(status).send(body)`",
    "5.0.0-alpha.4: Remove Express 3.x middleware error stubs",
    "5.0.0-alpha.3: `res.json(status, obj)` signature - use `res.status(status).json(obj)`",
    "5.0.0-alpha.3: `res.jsonp(status, obj)` signature - use `res.status(status).jsonp(obj)`",
    "5.0.0-alpha.3: `res.vary()` (no arguments) -- provide a field name as an argument",
    "5.0.0-alpha.2: `app.param(fn)`",
    "5.0.0-alpha.2: `req.param()` -- use `req.params`, `req.body`, or `req.query` instead",
    "5.0.0-alpha.1: `app.del` - use `app.delete`",
    "5.0.0-alpha.1: `req.acceptsCharset` - use `req.acceptsCharsets`",
    "5.0.0-alpha.1: `req.acceptsEncoding` - use `req.acceptsEncodings`",
    "5.0.0-alpha.1: `req.acceptsLanguage` - use `req.acceptsLanguages`",
    "5.0.0-alpha.1: `res.json(obj, status)` signature - use `res.json(status, obj)`",
    "5.0.0-alpha.1: `res.jsonp(obj, status)` signature - use `res.jsonp(status, obj)`",
    "5.0.0-alpha.1: `res.send(body, status)` signature - use `res.send(status, body)`",
    "5.0.0-alpha.1: `res.send(status)` signature - use `res.sendStatus(status)`",
    "5.0.0-alpha.1: `res.sendfile` - use `res.sendFile` instead",
    "5.0.0-alpha.1: `express.query` middleware"
  ],
  "requirements": [
    "5.0.0-beta.1: Requires Node.js 4+"
  ],
  "source": "https://github.com/expressjs/express/blob/HEAD/History.md",
  "without_notes": "4.22.0, 4.22.1, 4.22.2, 4.22.3",
  "package": "express",
  "from": "4.21.2",
  "to": "5.0.0"
}
```
<!-- example:end -->

## Tools

<!-- tools:start -->
| Tool | What it does |
| --- | --- |
| `changes_between` | Before an upgrade: breaking changes, removals, deprecations, security fixes and raised requirements (Node, Python...) between two versions of a package, from its changelog or GitHub releases, each tagged with its version. to defaults to the latest. |
| `release_notes` | The release notes of one version of a package (default the latest) from its changelog or GitHub release, with the release date and link. Short lines, commit and pull-request noise removed. |
| `search_changelog` | Finds the versions whose release notes mention a term (an API name, an option, 'deprecated', a CVE): each matching line with its version and date, oldest first, so you can see when something was added, deprecated or removed. |
<!-- tools:end -->

## How it behaves

- Read-only: no tool changes anything outside this process. Package names go to deps.dev, the npm
  registry and GitHub; nothing about your project is sent.
- Network: HTTPS only, to the hosts listed in `package.json` under `factory.allowHosts`, with a
  deadline, a size cap and bounded retries. Nothing else is contacted, and nothing is logged
  except unexpected failures (to stderr, without your inputs).
- Changelogs and release lists are cached for 30 minutes.
- Classification is by the notes' own words and section labels. A change a project did not write
  down as breaking is not flagged; `major_upgrades` names the major versions crossed regardless.
- Results are compact JSON with a matching output schema. Lists say how many items were left out.

## Benchmark

<!-- bench:start -->
Measured 2026-09-26 with gpt-5.4-mini, 9 fixed tasks graded by fixed checks (`bench/tasks.json`, raw results in `bench/results/`).

| Server | Correct | Input tokens | Output tokens | Tool calls | Median time |
| --- | --- | --- | --- | --- | --- |
| This server | 9/9 | 18046 | 675 | 16 | 4.8 s |
| mcp-server-fetch reading changelogs (no changelog server exists; this is what agents use today) | 6/9 | 145935 | 1792 | 42 | 11.4 s |
<!-- bench:end -->

## Performance

<!-- perf:start -->
Measured 2026-09-26 from Dubai, home connection against the live upstream, Node 24.19.0 (`bench/perf.json`, `scripts/perf.mjs` in the factory).

| Call | First call | Repeat | Result size |
| --- | --- | --- | --- |
| changes_between: express 4.21.2 to 5.0.0 (History.md) | 1973 ms | 1.6 ms | 2,465 chars |
| changes_between: requests 2.31.0 to 2.32.3 (HISTORY.md) | 2337 ms | 0.9 ms | 1,652 chars |
| changes_between: serde 1.0.150 to 1.0.200 (GitHub releases) | 4497 ms | 1.3 ms | 253 chars |
| search_changelog: express, req.param | 1756 ms | 5.3 ms | 650 chars |
| release_notes: react 18.0.0 | 3603 ms | 8.1 ms | 1,673 chars |
| search_changelog: react, useId | 3533 ms | 13.4 ms | 1,209 chars |

First call: a fresh server process, including the TLS connection and the upstream's own time. Repeat: the same call again, answered from the in-process cache, so it shows this server's own overhead.

Tool definitions the model reads on every turn (name, description, input schema): 1,792 characters, against 1,105 for mcp-server-fetch reading changelogs (no changelog server exists; this is what agents use today). The full tool list, with the output schemas and annotations clients use to validate results, is 2,732 characters (1,104 for the alternative).
<!-- perf:end -->

## Data sources

- [deps.dev](https://deps.dev) (Open Source Insights) for versions, publish dates and repositories,
  and the [npm registry](https://registry.npmjs.org) for monorepo directories.
- The package's GitHub repository: its CHANGELOG file and [GitHub releases](https://docs.github.com/en/rest/releases).

## More MCP servers by Arhan Canli

<!-- family:start -->
- [Actions Check](https://github.com/arhancanli/actions-check-mcp): Checks GitHub Actions workflows: outdated actions, old Node runtimes, retired runners, injection.
- [Domain Health](https://github.com/arhancanli/domain-health-mcp): Email and domain checks: SPF lookup limits, DKIM keys, DMARC, DNS records, registration expiry.
- [End of Life](https://github.com/arhancanli/end-of-life-mcp): Is this version still supported? EOL dates, latest patch and upgrade target for 470+ products.
- [Internet Standards](https://github.com/arhancanli/internet-standards-mcp): RFC sections, status, obsoleted-by chains, errata and IANA registries for coding agents.
- [License Check](https://github.com/arhancanli/license-check-mcp): Open source license answers: SPDX ids, copyleft, and whether a dependency's license fits yours.
- [Package Truth](https://github.com/arhancanli/package-truth-mcp): Checks packages exist before install: version, deprecation, vulnerabilities, licence. 7 ecosystems.
- [Citation Check](https://github.com/arhancanli/citation-check-mcp): Verifies citations: finds fabricated or mismatched references and retractions, returns clean BibTeX.
- [Drug Label](https://github.com/arhancanli/drug-label-mcp): FDA drug label answers with section citations, RxNorm name resolution, recalls and shortages.
- [The whole collection](https://github.com/arhancanli/mcp-factory#servers), 5 more
<!-- family:end -->

## License

MIT, Copyright (c) 2026 Arhan Canli.
