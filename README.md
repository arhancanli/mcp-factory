# MCP servers by Arhan Canli

Model Context Protocol servers, each built to be the best available in its niche, and each proven
by measurement against the best existing server before it ships.

Every server here:

- installs with one command (`npx`), one click (Claude Desktop bundle, signed), or Docker;
- keeps its tool list small and byte-stable, so it costs few tokens and caches well;
- returns compact JSON with an output schema, and says when a list was cut;
- reaches only the hosts it declares, over HTTPS, with deadlines, size caps and bounded retries;
- is tested on recorded upstream responses, and checked weekly against the live upstream;
- is published from CI with npm provenance and a Sigstore-signed bundle.

## Servers

<!-- servers:start -->
### Developer tools

| Server | What it does | Run |
| --- | --- | --- |
| [Actions Check](https://github.com/arhancanli/actions-check-mcp) | Checks GitHub Actions workflows: outdated actions, old Node runtimes, retired runners, injection. | `npx -y actions-check-mcp` |
| [Cron Check](https://github.com/arhancanli/cron-check-mcp) | Explains cron expressions, lists next run times in any time zone, converts between cron dialects. | `npx -y cron-check-mcp` |
| [Domain Health](https://github.com/arhancanli/domain-health-mcp) | Email and domain checks: SPF lookup limits, DKIM keys, DMARC, DNS records, registration expiry. | `npx -y domain-health-mcp` |
| [End of Life](https://github.com/arhancanli/end-of-life-mcp) | Is this version still supported? EOL dates, latest patch and upgrade target for 470+ products. | `npx -y end-of-life-mcp` |
| [Internet Standards](https://github.com/arhancanli/internet-standards-mcp) | RFC sections, status, obsoleted-by chains, errata and IANA registries for coding agents. | `npx -y internet-standards-mcp` |
| [License Check](https://github.com/arhancanli/license-check-mcp) | Open source license answers: SPDX ids, copyleft, and whether a dependency's license fits yours. | `npx -y license-check-mcp` |
| [Package Truth](https://github.com/arhancanli/package-truth-mcp) | Checks packages exist before install: version, deprecation, vulnerabilities, licence. 7 ecosystems. | `npx -y package-truth-mcp` |
| [Release Notes](https://github.com/arhancanli/release-notes-mcp) | What changed between two versions of a package: breaking changes, deprecations, security fixes. | `npx -y release-notes-mcp` |

### Science and research

| Server | What it does | Run |
| --- | --- | --- |
| [Citation Check](https://github.com/arhancanli/citation-check-mcp) | Verifies citations: finds fabricated or mismatched references and retractions, returns clean BibTeX. | `npx -y citation-check-mcp` |

### Health and medicine

| Server | What it does | Run |
| --- | --- | --- |
| [Drug Label](https://github.com/arhancanli/drug-label-mcp) | FDA drug label answers with section citations, RxNorm name resolution, recalls and shortages. | `npx -y drug-label-mcp` |

### Maps, earth and transport

| Server | What it does | Run |
| --- | --- | --- |
| [Satellite Imagery](https://github.com/arhancanli/satellite-imagery-mcp) | Find the clearest Sentinel-2, Landsat, Sentinel-1 or NAIP scene for any place, with band links. | `npx -y satellite-imagery-mcp` |

### Consumer safety

| Server | What it does | Run |
| --- | --- | --- |
| [Recall Check](https://github.com/arhancanli/recall-check-mcp) | One recall check across CPSC, FDA and NHTSA: match by name, model number, UPC or VIN. | `npx -y recall-check-mcp` |

### Security

| Server | What it does | Run |
| --- | --- | --- |
| [Vuln Priority](https://github.com/arhancanli/vuln-priority-mcp) | Which vulnerabilities to fix first: CISA KEV, EPSS, CVSS and CISA's SSVC decisions in one ranking. | `npx -y vuln-priority-mcp` |

### Data and datasets

| Server | What it does | Run |
| --- | --- | --- |
| [Contact Check](https://github.com/arhancanli/contact-check-mcp) | Validates and formats phone numbers, email addresses and postal addresses for any country. | `npx -y contact-check-mcp` |

### Productivity

| Server | What it does | Run |
| --- | --- | --- |
| [Web Reader](https://github.com/arhancanli/web-reader-mcp) | Reads web pages and PDFs as clean Markdown: main content, the sections that answer a query. | `npx -y web-reader-mcp` |
| [World Time](https://github.com/arhancanli/world-time-mcp) | Time anywhere, DST-safe conversions, holidays for 200+ countries, business days and meeting slots. | `npx -y world-time-mcp` |
<!-- servers:end -->

## How they are made

`docs/SPEC.md` describes the production line: scout, build, gate, benchmark, ship. The gate
(`gate/`) is the same for every server and runs in CI on Node 20, 22 and 24.

```sh
npm ci
npm test                                   # kit tests + the gate on every server
npm run new -- <name> --title "..." --description "..." --host api.example.org --instructions "..."
npm run sync                               # after changing kit/, a tool, or adding a server
node scripts/check-standalone.mjs          # each server as its own repository: install, test, start
node scripts/publish-repos.mjs [name]      # push committed servers to their own repositories
```

Each server lives in its own repository (linked above); this repository is where they are built and
checked. `catalog.json` lists every server and its tools.

## License

MIT, Copyright (c) 2026 Arhan Canli.
