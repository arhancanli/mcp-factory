# License Check

<!-- badges:start -->
[![CI](https://github.com/arhancanli/license-check-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/arhancanli/license-check-mcp/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/license-check-mcp)](https://www.npmjs.com/package/license-check-mcp)
[![downloads](https://img.shields.io/npm/dw/license-check-mcp)](https://www.npmjs.com/package/license-check-mcp)
[![OpenSSF Scorecard](https://api.securityscorecards.dev/projects/github.com/arhancanli/license-check-mcp/badge)](https://scorecard.dev/viewer/?uri=github.com/arhancanli/license-check-mcp)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
<!-- badges:end -->

Can I use this dependency? License questions come up every time an agent adds a package, and
models answer them from memory, which blurs the cases that matter: Apache-2.0 code may go into a
GPL-3.0 project but not a GPL-2.0-only one; an MIT project cannot absorb GPL code; LGPL depends on
how it is linked. License Check answers from authoritative data:

- **Compatibility** of any license or SPDX expression (`MIT OR GPL-3.0-only`, `GPL-2.0-only WITH
  Classpath-exception-2.0`) with your project's license, from the
  [OSADL license compatibility matrix](https://www.osadl.org/Access-to-raw-data.oss-compliance-raw-data-access.0.html)
  with its reason: yes, no, or check (it depends on how the code is combined). For a proprietary
  project, by copyleft class. OR takes the option that works; AND needs every part.
- **Dependencies** in one call: the declared licenses of up to 50 packages (npm, PyPI, crates.io, Go,
  Maven, NuGet) from deps.dev, checked against your license, copyleft ones flagged.
- **Identification**: the SPDX id for "Apache License 2.0", "GPLv3", "New BSD" or a deprecated id,
  with OSI approval, FSF status, copyleft class and OSADL's obligations checklist.

Licenses outside OSADL's matrix (Creative Commons, source-available licenses such as BUSL and SSPL)
are judged by their kind and say so. This is information, not legal advice. No key needed.

Built and maintained by [Arhan Canli](https://github.com/arhancanli).

## Install

<!-- install:start -->
[![Install in Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=license-check&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsImxpY2Vuc2UtY2hlY2stbWNwIl19)
[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install_Server-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=license-check&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22license-check-mcp%22%5D%7D)
[![Install in Goose](https://block.github.io/goose/img/extension-install-dark.svg)](https://block.github.io/goose/extension?cmd=npx&arg=-y&arg=license-check-mcp&id=license-check&name=License%20Check&description=Answers%20open%20source%20license%20questions%20from%20authoritative%20data%3A%20the%20SPDX%20identifier%20for%20any%20way%20a%20license%20is%20written%2C%20whether%20it%20is%20OSI%20approved%20and%20copyleft%2C%20and%20whether%20a%20dependency's%20license%20can%20be%20combined%20with%20your%20project's%20(OSADL's%20compatibility%20matrix%2C%20with%20the%20reason)%2C%20for%20SPDX%20expressions%20with%20OR%2C%20AND%20and%20exceptions%2C%20and%20for%20whole%20dependency%20lists%20via%20deps.dev.%20Not%20legal%20advice.%20No%20key.)

Needs Node.js 20 or newer. No account or key.

**Claude Code**

```sh
claude mcp add license-check -- npx -y license-check-mcp
```

**Claude Desktop**: download `license-check-mcp-<version>.mcpb` from the [latest release](https://github.com/arhancanli/license-check-mcp/releases/latest) and open it. The bundle is signed; verify it with `gh attestation verify <file> --repo arhancanli/license-check-mcp`.

**Any other client** (Windsurf, Zed, Cline, Continue and others), in its MCP config file:

```json
{
  "mcpServers": {
    "license-check": {
      "command": "npx",
      "args": [
        "-y",
        "license-check-mcp"
      ]
    }
  }
}
```

**Docker**

```sh
docker build -t license-check-mcp https://github.com/arhancanli/license-check-mcp.git && docker run -i --rm license-check-mcp
```

**Hosted (Streamable HTTP)**: `node src/server.mjs --http` serves stateless MCP at `POST /mcp` (port from `PORT`, default 3000).
<!-- install:end -->

## Example

<!-- example:start -->
An agent calls `check_compatibility` with:

```json
{
  "project": "GPL-2.0-only",
  "licenses": [
    "Apache-2.0",
    "MIT",
    "MIT OR GPL-3.0-only",
    "GPL-2.0-only WITH Classpath-exception-2.0",
    "LGPL-2.1-or-later",
    "Foo License"
  ]
}
```

and gets back (recorded from the live server on 2026-09-26):

```json
{
  "project": "GPL-2.0-only",
  "counts": {
    "no": 1,
    "unknown": 1,
    "check": 1,
    "yes": 3
  },
  "results": [
    {
      "license": "Apache-2.0",
      "verdict": "no",
      "copyleft": "No",
      "reason": "Incompatibility of the Apache-2.0 license with the GPL-2.0-only license is explicitly stated in the GPL-2.0-only license checklist."
    },
    {
      "license": "Foo License",
      "verdict": "unknown",
      "reason": "\"Foo License\" is not a license SPDX lists; check its terms by hand."
    },
    {
      "license": "LGPL-2.1-or-later",
      "verdict": "check",
      "copyleft": "Yes (restricted)",
      "reason": "Depending compatibility of the LGPL-2.1-or-later license with the GPL-2.0-only license is explicitly stated in the GPL-2.0-only license checklist. Interpretation: LGPL-2.1-or-later licensed material must first be relicensed under GPL-2.0-only before compatibility with other GPL-2.0 licensed material can be established."
    },
    {
      "license": "MIT",
      "verdict": "yes",
      "copyleft": "No",
      "reason": "Compatibility of the MIT license with the GPL-2.0-only license is explicitly stated in the GPL-2.0-only license checklist."
    },
    {
      "license": "MIT OR GPL-3.0-only",
      "expression": "(MIT OR GPL-3.0-only)",
      "verdict": "yes",
      "via": "MIT",
      "reason": "Compatibility of the MIT license with the GPL-2.0-only license is explicitly stated in the GPL-2.0-only license checklist.",
      "note": "You may choose any of: MIT (yes), GPL-3.0-only (no)."
    },
    {
      "license": "GPL-2.0-only WITH Classpath-exception-2.0",
      "verdict": "yes",
      "copyleft": "Yes",
      "reason": "The same license.",
      "note": "GPL-2.0-only WITH Classpath-exception-2.0: the exception relaxes the license's conditions."
    }
  ],
  "note": "Not legal advice: verdicts follow OSADL's license compatibility matrix."
}
```
<!-- example:end -->

## Tools

<!-- tools:start -->
| Tool | What it does |
| --- | --- |
| `check_compatibility` | Whether code under each of up to 100 licenses or SPDX expressions (MIT OR GPL-3.0-only, GPL-2.0-only WITH Classpath-exception-2.0) may be included in a project under yours (an SPDX id, or 'proprietary'): yes, no or check, with OSADL's reason. Worst first. |
| `license_info` | Identifies up to 20 licenses however they are written ("Apache License 2.0", "GPLv3", "New BSD", deprecated SPDX ids): SPDX id and name, OSI approved, FSF free, copyleft class and source-disclosure duty (OSADL), links to the text and OSADL's obligations checklist. |
| `package_licenses` | Looks up the licenses of up to 50 packages (npm, PyPI, crates.io, Go, Maven, NuGet; a version, or the latest) and, with project, whether each fits your license (yes, no, check). Copyleft ones are flagged. Worst first. |
<!-- tools:end -->

## How it behaves

- Read-only: no tool changes anything outside this process.
- Network: HTTPS only, to the hosts listed in `package.json` under `factory.allowHosts`, with a
  deadline, a size cap and bounded retries. Nothing else is contacted, and nothing is logged
  except unexpected failures (to stderr, without your inputs).
- The SPDX list and OSADL's data are downloaded once and kept for a day (OSADL's matrix with reasons
  is 3.5 MB, so the first call takes a few seconds).
- Results are compact JSON with a matching output schema, worst verdict first.

## Benchmark

<!-- bench:start -->
Measured 2026-09-26 with gpt-5.4-mini, 9 fixed tasks graded by fixed checks (`bench/tasks.json`, raw results in `bench/results/`).

| Server | Correct | Input tokens | Output tokens | Tool calls | Median time |
| --- | --- | --- | --- | --- | --- |
| This server | 9/9 | 10760 | 342 | 9 | 2.5 s |
| mcp-server-fetch reading license sources (no license server exists; this is what agents use today) | 6/9 | 75485 | 1686 | 42 | 17.7 s |
<!-- bench:end -->

## Performance

<!-- perf:start -->
Measured 2026-09-26 from Dubai, home connection against the live upstream, Node 24.19.0 (`bench/perf.json`, `scripts/perf.mjs` in the factory).

| Call | First call | Repeat | Result size |
| --- | --- | --- | --- |
| check_compatibility: 6 licenses in a GPL-2.0-only project | 2663 ms | 0.3 ms | 1,602 chars |
| check_compatibility: a proprietary project, copyleft and content licenses | 5308 ms | 0.5 ms | 1,485 chars |
| license_info: 6 licenses written informally | 2206 ms | 0.5 ms | 1,913 chars |
| package_licenses: 4 packages against MIT | 3157 ms | 0.3 ms | 657 chars |

First call: a fresh server process, including the TLS connection and the upstream's own time. Repeat: the same call again, answered from the in-process cache, so it shows this server's own overhead.

Tool definitions the model reads on every turn (name, description, input schema): 1,720 characters, against 1,105 for mcp-server-fetch reading license sources (no license server exists; this is what agents use today). The full tool list, with the output schemas and annotations clients use to validate results, is 2,963 characters (1,104 for the alternative).
<!-- perf:end -->

## Data sources

- [SPDX License List](https://github.com/spdx/license-list-data) (CC0).
- [OSADL Open Source License Checklists](https://www.osadl.org/Access-to-raw-data.oss-compliance-raw-data-access.0.html):
  compatibility matrix with explanations, copyleft classification, source-disclosure duties. CC BY
  4.0, "A project by the Open Source Automation Development Lab (OSADL) eG".
- [deps.dev](https://deps.dev) for package licenses.

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
- [The whole collection](https://github.com/arhancanli/mcp-factory#servers), 10 more
<!-- family:end -->

## License

MIT, Copyright (c) 2026 Arhan Canli.
