# Domain Health

<!-- badges:start -->
[![CI](https://github.com/arhancanli/domain-health-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/arhancanli/domain-health-mcp/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/domain-health-mcp)](https://www.npmjs.com/package/domain-health-mcp)
[![downloads](https://img.shields.io/npm/dw/domain-health-mcp)](https://www.npmjs.com/package/domain-health-mcp)
[![OpenSSF Scorecard](https://api.securityscorecards.dev/projects/github.com/arhancanli/domain-health-mcp/badge)](https://scorecard.dev/viewer/?uri=github.com/arhancanli/domain-health-mcp)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
<!-- badges:end -->

Why is mail from this domain going to spam, and is the domain about to lapse? Domain Health checks a
domain the way receiving mail servers and registries see it, and says what to fix:

- **SPF evaluated in full**, as RFC 7208 defines it: the whole include tree, the count of DNS
  lookups against the limit of 10 (one more include silently breaks SPF for all your mail), void
  lookups, syntax, and for a sending IP the verdict a receiver would reach (pass, fail, softfail,
  neutral, permerror) with the mechanism that decided it.
- **DMARC** found by walking up the DNS tree, so a subdomain shows the policy it inherits;
  **DKIM** keys with their type and size (a 1024-bit key still works, 2048 is recommended);
  **MTA-STS**, **TLS-RPT**, **BIMI** and **CAA**.
- **Gmail and Yahoo bulk-sender rules**: whether SPF, DKIM and DMARC are in place. DKIM selectors
  cannot be listed from DNS, so a key not at common selectors is reported as not confirmed, never
  as missing.
- **Registration** from the registry's own RDAP server: registrar, creation and expiry dates, days
  left, status codes, DNSSEC; availability of names you are thinking of registering.

`domain_report` answers most questions in one call, with findings ranked error, warning, info, each
with a fix. No account or key needed.

Built and maintained by [Arhan Canli](https://github.com/arhancanli).

## Install

<!-- install:start -->
[![Install in Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=domain-health&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsImRvbWFpbi1oZWFsdGgtbWNwIl19)
[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install_Server-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=domain-health&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22domain-health-mcp%22%5D%7D)
[![Install in Goose](https://block.github.io/goose/img/extension-install-dark.svg)](https://block.github.io/goose/extension?cmd=npx&arg=-y&arg=domain-health-mcp&id=domain-health&name=Domain%20Health&description=Checks%20a%20domain%20the%20way%20mail%20providers%20and%20registrars%20see%20it%3A%20SPF%20evaluated%20in%20full%20(the%2010-lookup%20limit%2C%20void%20lookups%2C%20whether%20an%20IP%20may%20send)%2C%20DKIM%20keys%20and%20their%20strength%2C%20DMARC%20policy%20with%20the%20DNS%20tree%20walk%2C%20MTA-STS%2C%20TLS-RPT%2C%20BIMI%2C%20CAA%2C%20DNS%20records%20from%20two%20resolvers%2C%20and%20registration%20data%20from%20the%20registry's%20RDAP%20server.%20No%20key.)

Needs Node.js 20 or newer. No account or key.

**Claude Code**

```sh
claude mcp add domain-health -- npx -y domain-health-mcp
```

**Claude Desktop**: download `domain-health-mcp-<version>.mcpb` from the [latest release](https://github.com/arhancanli/domain-health-mcp/releases/latest) and open it. The bundle is signed; verify it with `gh attestation verify <file> --repo arhancanli/domain-health-mcp`.

**Any other client** (Windsurf, Zed, Cline, Continue and others), in its MCP config file:

```json
{
  "mcpServers": {
    "domain-health": {
      "command": "npx",
      "args": [
        "-y",
        "domain-health-mcp"
      ]
    }
  }
}
```

**Docker**

```sh
docker build -t domain-health-mcp https://github.com/arhancanli/domain-health-mcp.git && docker run -i --rm domain-health-mcp
```

**Hosted (Streamable HTTP)**: `node src/server.mjs --http` serves stateless MCP at `POST /mcp` (port from `PORT`, default 3000).
<!-- install:end -->

## Example

<!-- example:start -->
An agent calls `domain_report` with:

```json
{
  "domain": "google.com"
}
```

and gets back (recorded from the live server on 2026-09-26):

```json
{
  "domain": "google.com",
  "registration": {
    "registrar": "MarkMonitor Inc.",
    "created": "1997-09-15",
    "expires": "2028-09-14",
    "days_left": 718,
    "dnssec": false
  },
  "nameservers": [
    "ns4.google.com",
    "ns1.google.com",
    "ns2.google.com",
    "ns3.google.com"
  ],
  "mx": [
    "10 smtp.google.com"
  ],
  "spf": {
    "record": "v=spf1 include:_spf.google.com ~all",
    "lookups": 1,
    "all": "~all"
  },
  "dmarc": {
    "policy": "reject",
    "reports": 1
  },
  "mta_sts": true,
  "tls_rpt": true,
  "caa": [
    "pki.goog"
  ],
  "bulk_sender_dns": "SPF and DMARC meet the requirements; DKIM not confirmed (no key at common selectors)",
  "findings": [
    {
      "level": "info",
      "issue": "No DKIM key at 12 common selectors. Senders that sign use their own selector.",
      "fix": "Check with check_dkim and the selector from a sent message (DKIM-Signature s=)."
    }
  ]
}
```
<!-- example:end -->

## Tools

<!-- tools:start -->
| Tool | What it does |
| --- | --- |
| `check_dkim` | Looks up DKIM keys at the given selectors (or 30 common provider selectors): key type, size in bits, testing and revoked flags, problems. Selectors cannot be listed from DNS; the selector is in a sent message's DKIM-Signature (s=). |
| `check_spf` | Evaluates a domain's SPF in full: the include tree, DNS lookups against the limit of 10, void lookups, syntax, and with ip the result a receiver would reach (pass, fail, softfail, neutral, permerror) and the mechanism that decided it. |
| `dns_lookup` | DNS records of a name by type (default A, AAAA, MX, NS, TXT, CAA) with TTLs, from Cloudflare's resolver; compare: true also asks Google's and flags differences (propagation). Says when DNSSEC validated the answer. |
| `domain_lookup` | Registration of up to 20 domains from each registry's RDAP server: registered or likely available, registrar, created and expiry dates, days left, status codes, DNSSEC, name servers. Subdomains resolve to their registrable domain. |
| `domain_report` | One-call health check of a domain: registration and expiry, name servers, MX, SPF (lookups, policy), DMARC, DKIM at common selectors, MTA-STS, TLS-RPT, BIMI, CAA, DNSSEC, and whether it meets Gmail and Yahoo bulk-sender DNS rules, with ranked findings and fixes. |
<!-- tools:end -->

## How it behaves

- Read-only and passive: it asks public resolvers and registries, and never connects to the domain
  being checked (no mail server probes, no web requests to it).
- Network: HTTPS only. DNS goes to Cloudflare's and Google's DNS-over-HTTPS resolvers; RDAP goes
  only to the registry servers IANA's bootstrap file names (the RDAP client's allowlist is built from
  that file); the Public Suffix List comes from publicsuffix.org. Nothing else is contacted, and
  nothing is logged except unexpected failures (to stderr, without your inputs).
- DNS answers are cached for 30 seconds, since people check right after changing records.
- Results are compact JSON with a matching output schema. Long record lists say how many were left
  out.

## Benchmark

<!-- bench:start -->
Measured 2026-09-26 with gpt-5.4-mini, 13 fixed tasks graded by fixed checks (`bench/tasks.json`, raw results in `bench/results/`).

| Server | Correct | Input tokens | Output tokens | Tool calls | Median time |
| --- | --- | --- | --- | --- | --- |
| This server | 13/13 | 29631 | 583 | 18 | 2.8 s |
| mcp-dns, the most-used DNS lookup server | 3/13 | 13058 | 734 | 29 | 2.6 s |
<!-- bench:end -->

## Performance

<!-- perf:start -->
Measured 2026-09-26 from Dubai, home connection against the live upstream, Node 24.19.0 (`bench/perf.json`, `scripts/perf.mjs` in the factory).

| Call | First call | Repeat | Result size |
| --- | --- | --- | --- |
| domain_report: google.com | 2246 ms | 0.8 ms | 740 chars |
| domain_report: intel.com (DMARC p=none) | 2413 ms | 0.5 ms | 1,444 chars |
| check_spf: gmail.com for one of Google's sending IPs | 309 ms | 0.3 ms | 532 chars |
| check_spf: gmail.com for an outside IP | 301 ms | 0.3 ms | 521 chars |
| check_spf: oracle.com, at the 10-lookup limit | 737 ms | 0.5 ms | 3,895 chars |
| check_dkim: github.com, named selectors | 262 ms | 0.3 ms | 248 chars |
| check_dkim: stripe.com, 30 common selectors | 781 ms | 1 ms | 716 chars |
| dns_lookup: github.com from two resolvers | 1172 ms | 0.3 ms | 2,594 chars |
| domain_lookup: 5 names (subdomain, co.uk, unregistered, no RDAP) | 2702 ms | 0.3 ms | 1,713 chars |

First call: a fresh server process, including the TLS connection and the upstream's own time. Repeat: the same call again, answered from the in-process cache, so it shows this server's own overhead.

Tool definitions the model reads on every turn (name, description, input schema): 2,503 characters, against 254 for mcp-dns, the most-used DNS lookup server. The full tool list, with the output schemas and annotations clients use to validate results, is 4,239 characters (253 for the alternative).
<!-- perf:end -->

## Data sources

- DNS: [Cloudflare](https://developers.cloudflare.com/1.1.1.1/encryption/dns-over-https/) and
  [Google](https://developers.google.com/speed/public-dns/docs/doh) public DNS over HTTPS.
- Registration: each registry's RDAP server, found through [IANA's RDAP bootstrap](https://data.iana.org/rdap/dns.json).
- Registrable domains: the [Public Suffix List](https://publicsuffix.org) (ICANN section).

## More MCP servers by Arhan Canli

<!-- family:start -->
- [End of Life](https://github.com/arhancanli/end-of-life-mcp): Is this version still supported? EOL dates, latest patch and upgrade target for 470+ products.
- [Internet Standards](https://github.com/arhancanli/internet-standards-mcp): RFC sections, status, obsoleted-by chains, errata and IANA registries for coding agents.
- [Package Truth](https://github.com/arhancanli/package-truth-mcp): Checks packages exist before install: version, deprecation, vulnerabilities, licence. 7 ecosystems.
- [Citation Check](https://github.com/arhancanli/citation-check-mcp): Verifies citations: finds fabricated or mismatched references and retractions, returns clean BibTeX.
- [Drug Label](https://github.com/arhancanli/drug-label-mcp): FDA drug label answers with section citations, RxNorm name resolution, recalls and shortages.
- [Recall Check](https://github.com/arhancanli/recall-check-mcp): One recall check across CPSC, FDA and NHTSA: match by name, model number, UPC or VIN.
- [Satellite Imagery](https://github.com/arhancanli/satellite-imagery-mcp): Find the clearest Sentinel-2, Landsat, Sentinel-1 or NAIP scene for any place, with band links.
- [Vuln Priority](https://github.com/arhancanli/vuln-priority-mcp): Which vulnerabilities to fix first: CISA KEV, EPSS, CVSS and CISA's SSVC decisions in one ranking.
- [The whole collection](https://github.com/arhancanli/mcp-factory#servers), 1 more
<!-- family:end -->

## License

MIT, Copyright (c) 2026 Arhan Canli.
