# Internet Standards

<!-- badges:start -->
[![CI](https://github.com/arhancanli/internet-standards-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/arhancanli/internet-standards-mcp/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/internet-standards-mcp)](https://www.npmjs.com/package/internet-standards-mcp)
[![downloads](https://img.shields.io/npm/dw/internet-standards-mcp)](https://www.npmjs.com/package/internet-standards-mcp)
[![OpenSSF Scorecard](https://api.securityscorecards.dev/projects/github.com/arhancanli/internet-standards-mcp/badge)](https://scorecard.dev/viewer/?uri=github.com/arhancanli/internet-standards-mcp)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
<!-- badges:end -->

RFCs and IANA registries for coding agents, straight from the RFC Editor and IANA: the exact text of
any RFC section, whether an RFC is still current and what replaces it today, the errata filed against
a section, and registered values such as HTTP status codes, header fields, media types, ports and TLS
cipher suites.

Models quote obsolete RFCs from memory. Ask one about HTTP/1.1 and it cites RFC 2616, which was
replaced twice (by RFCs 7230 to 7235 in 2014, then by RFCs 9110 to 9112 in 2022). Internet Standards
follows every obsoleted-by chain to its end, warns whenever a section comes from an obsolete RFC, and
returns section text verbatim with the verified errata that correct it, so an agent can quote a
requirement exactly and know it still applies.

- `rfc_info`: status, whether it is current, what obsoletes it and the current replacements at the
  end of the chain, what updates it. Accepts RFC numbers, BCP/STD/FYI series (BCP 14 is RFC 2119 and
  RFC 8174) and Internet-Draft names.
- `rfc_section`: one section's exact text by number (15.5.5) or title, with its verified and held
  errata; a phrase search across the RFC; or the table of contents, with subsections listed so an
  agent can drill down.
- `search_rfcs`: topic search in which current documents rank above the ones they replaced.
- `iana_lookup`: HTTP status codes, fields and methods, media types, URI schemes, port numbers, TLS
  cipher suites, link relations and DNS record types, each with its defining RFC section.

No account or key needed. Built and maintained by [Arhan Canli](https://github.com/arhancanli).

## Install

<!-- install:start -->
[![Install in Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=internet-standards&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsImludGVybmV0LXN0YW5kYXJkcy1tY3AiXX0%3D)
[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install_Server-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=internet-standards&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22internet-standards-mcp%22%5D%7D)
[![Install in Goose](https://block.github.io/goose/img/extension-install-dark.svg)](https://block.github.io/goose/extension?cmd=npx&arg=-y&arg=internet-standards-mcp&id=internet-standards&name=Internet%20Standards&description=RFCs%2C%20errata%20and%20IANA%20registries%20for%20coding%20agents%3A%20exact%20section%20text%2C%20status%20and%20obsoleted-by%20chains%20to%20the%20current%20replacement%2C%20errata%20per%20section%2C%20and%20protocol%20registry%20entries%20with%20their%20defining%20references.)

Needs Node.js 20 or newer. No account or key.

**Claude Code**

```sh
claude mcp add internet-standards -- npx -y internet-standards-mcp
```

**Claude Desktop**: download `internet-standards-mcp-<version>.mcpb` from the [latest release](https://github.com/arhancanli/internet-standards-mcp/releases/latest) and open it. The bundle is signed; verify it with `gh attestation verify <file> --repo arhancanli/internet-standards-mcp`.

**Any other client** (Windsurf, Zed, Cline, Continue and others), in its MCP config file:

```json
{
  "mcpServers": {
    "internet-standards": {
      "command": "npx",
      "args": [
        "-y",
        "internet-standards-mcp"
      ]
    }
  }
}
```

**Docker**

```sh
docker build -t internet-standards-mcp https://github.com/arhancanli/internet-standards-mcp.git && docker run -i --rm internet-standards-mcp
```

**Hosted (Streamable HTTP)**: `node src/server.mjs --http` serves stateless MCP at `POST /mcp` (port from `PORT`, default 3000).
<!-- install:end -->

## Example

<!-- example:start -->
An agent calls `rfc_info` with:

```json
{
  "ids": [
    "RFC 2616",
    "BCP 14",
    "draft-ietf-httpbis-semantics",
    "RFC 99999"
  ]
}
```

and gets back (recorded from the live server on 2026-09-26):

```json
{
  "results": [
    {
      "id": "RFC 2616",
      "rfc": "RFC 2616",
      "title": "Hypertext Transfer Protocol -- HTTP/1.1",
      "status": "Draft Standard",
      "current": false,
      "obsoleted_by": [
        "RFC 7230",
        "RFC 7231",
        "RFC 7232",
        "RFC 7233",
        "RFC 7234",
        "RFC 7235"
      ],
      "current_replacements": [
        "RFC 9110",
        "RFC 9111",
        "RFC 9112"
      ],
      "updated_by": [
        "RFC 2817",
        "RFC 5785",
        "RFC 6266",
        "RFC 6585"
      ],
      "obsoletes": [
        "RFC 2068"
      ],
      "published": "June 1999",
      "authors": "R. Fielding, J. Gettys, J. Mogul, H. Frystyk, L. Masinter et al.",
      "url": "https://www.rfc-editor.org/rfc/rfc2616.html",
      "errata": "https://www.rfc-editor.org/errata/rfc2616",
      "info": "https://www.rfc-editor.org/info/rfc2616"
    },
    {
      "id": "BCP 14",
      "series": "BCP14",
      "rfc": "RFC 2119",
      "title": "Key words for use in RFCs to Indicate Requirement Levels",
      "status": "Best Current Practice",
      "current": true,
      "updated_by": [
        "RFC 8174"
      ],
      "published": "March 1997",
      "authors": "S. Bradner",
      "url": "https://www.rfc-editor.org/rfc/rfc2119.html",
      "errata": "https://www.rfc-editor.org/errata/rfc2119",
      "info": "https://www.rfc-editor.org/info/rfc2119"
    },
    {
      "id": "BCP 14",
      "series": "BCP14",
      "rfc": "RFC 8174",
      "title": "Ambiguity of Uppercase vs Lowercase in RFC 2119 Key Words",
      "status": "Best Current Practice",
      "current": true,
      "updates": [
... (43 more lines)
```
<!-- example:end -->

## Tools

<!-- tools:start -->
| Tool | What it does |
| --- | --- |
| `iana_lookup` | Looks up an entry in an IANA registry (HTTP status codes, fields, methods; media types; URI schemes; port numbers; TLS cipher suites; link relations; DNS record types) by exact value or name, else by text. Returns the entry and its defining RFC section. |
| `rfc_info` | For up to 20 RFCs (RFC 2616, BCP 14, STD 97 or a draft name): title, status, whether it is current, what obsoletes it and the current replacements at the end of that chain, what updates it, and links. Use before citing or implementing an RFC. |
| `rfc_section` | Returns the exact text of one RFC section (by number like 15.5.5 or by title) with the verified errata that apply to it; with find, lists the sections containing a phrase; with neither, the table of contents. Warns when the RFC is obsolete. |
| `search_rfcs` | Finds RFCs by topic words in titles, keywords and abstracts; current documents rank above the ones they replaced. Returns number, title, status, year and what obsoletes each. |
<!-- tools:end -->

## How it behaves

- Read-only: no tool changes anything outside this process.
- Network: HTTPS only, to the hosts listed in `package.json` under `factory.allowHosts`, with a
  deadline, a size cap and bounded retries; a read that stalls is abandoned and retried. Nothing else
  is contacted, and nothing is logged except unexpected failures (to stderr, without your inputs).
- Per-RFC lookups use the RFC Editor's small per-document records. The full RFC index (for search,
  series and drafts) and the errata export are downloaded compressed on first use, then kept in
  memory as parsed data for 12 hours; RFC texts and IANA registries for 24 hours.
- Section text is the RFC Editor's published plain text with page footers and running headers
  removed; long sections are cut at 12,000 characters with an explicit marker.
- Results are compact JSON with a matching output schema.

## Benchmark

<!-- bench:start -->
Measured 2026-09-26 with gpt-5.4-mini, 10 fixed tasks graded by fixed checks (`bench/tasks.json`, raw results in `bench/results/`).

| Server | Correct | Input tokens | Output tokens | Tool calls | Median time |
| --- | --- | --- | --- | --- | --- |
| This server | 10/10 | 16294 | 350 | 10 | 2.1 s |
| rfcxml-mcp, the most active RFC server | 5/10 | 206325 | 782 | 24 | 4.1 s |
<!-- bench:end -->

## Performance

<!-- perf:start -->
Measured 2026-09-26 from Dubai, home connection against the live upstream, Node 24.19.0 (`bench/perf.json`, `scripts/perf.mjs` in the factory).

| Call | First call | Repeat | Result size |
| --- | --- | --- | --- |
| rfc_info: RFC 2616, BCP 14, a draft name and a missing number | 1814 ms | 0.6 ms | 2,055 chars |
| rfc_section: RFC 9110 section 12.5.1 with its errata | 1868 ms | 0.5 ms | 6,171 chars |
| rfc_section: RFC 7231 section 6.5.4 (paginated, obsolete) | 2795 ms | 0.4 ms | 997 chars |
| rfc_section: find a phrase in RFC 9110 | 636 ms | 4.6 ms | 5,094 chars |
| search_rfcs: http semantics | 1212 ms | 3.6 ms | 1,190 chars |
| iana_lookup: HTTP status 418 | 358 ms | 0.4 ms | 245 chars |
| iana_lookup: media type application/json | 278 ms | 0.6 ms | 206 chars |
| iana_lookup: port 5432 | 480 ms | 1.1 ms | 497 chars |

First call: a fresh server process, including the TLS connection and the upstream's own time. Repeat: the same call again, answered from the in-process cache, so it shows this server's own overhead.

Tool definitions the model reads on every turn (name, description, input schema): 2,119 characters, against 3,643 for rfcxml-mcp, the most active RFC server. The full tool list, with the output schemas and annotations clients use to validate results, is 3,610 characters (3,636 for the alternative).
<!-- perf:end -->

## Data sources

- [RFC Editor](https://www.rfc-editor.org): per-RFC records, RFC text, the RFC index and the errata
  database.
- [IANA](https://www.iana.org/protocols) protocol registries (CSV exports).

## More MCP servers by Arhan Canli

<!-- family:start -->
- [Domain Health](https://github.com/arhancanli/domain-health-mcp): Email and domain checks: SPF lookup limits, DKIM keys, DMARC, DNS records, registration expiry.
- [End of Life](https://github.com/arhancanli/end-of-life-mcp): Is this version still supported? EOL dates, latest patch and upgrade target for 470+ products.
- [License Check](https://github.com/arhancanli/license-check-mcp): Open source license answers: SPDX ids, copyleft, and whether a dependency's license fits yours.
- [Package Truth](https://github.com/arhancanli/package-truth-mcp): Checks packages exist before install: version, deprecation, vulnerabilities, licence. 7 ecosystems.
- [Release Notes](https://github.com/arhancanli/release-notes-mcp): What changed between two versions of a package: breaking changes, deprecations, security fixes.
- [Citation Check](https://github.com/arhancanli/citation-check-mcp): Verifies citations: finds fabricated or mismatched references and retractions, returns clean BibTeX.
- [Drug Label](https://github.com/arhancanli/drug-label-mcp): FDA drug label answers with section citations, RxNorm name resolution, recalls and shortages.
- [Recall Check](https://github.com/arhancanli/recall-check-mcp): One recall check across CPSC, FDA and NHTSA: match by name, model number, UPC or VIN.
- [The whole collection](https://github.com/arhancanli/mcp-factory#servers), 4 more
<!-- family:end -->

## License

MIT, Copyright (c) 2026 Arhan Canli.
