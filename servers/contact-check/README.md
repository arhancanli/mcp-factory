# Contact Check

<!-- badges:start -->
[![CI](https://github.com/arhancanli/contact-check-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/arhancanli/contact-check-mcp/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/contact-check-mcp)](https://www.npmjs.com/package/contact-check-mcp)
[![downloads](https://img.shields.io/npm/dw/contact-check-mcp)](https://www.npmjs.com/package/contact-check-mcp)
[![OpenSSF Scorecard](https://api.securityscorecards.dev/projects/github.com/arhancanli/contact-check-mcp/badge)](https://scorecard.dev/viewer/?uri=github.com/arhancanli/contact-check-mcp)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
<!-- badges:end -->

Agents fill forms, clean CRM exports and write shipping labels, and they check contact data by
eye: a UK number written without its country code, `jane@gmial.com`, a ZIP code with four digits,
a German address "missing" the state it does not need. Contact Check validates and normalises
contact data with the rules that production systems use:

- **Phone numbers** with Google's libphonenumber data (offline): valid for their country or why
  not, the type (mobile, fixed line, toll free, VoIP...), E.164, international and national forms.
  North American numbers in the range reserved for fiction are noted.
- **Email addresses** without sending anything: syntax, whether the domain accepts mail (MX
  records, a null MX that refuses all mail, or none at all), disposable providers, role accounts,
  and likely typos of the big providers (gmial.com, outlook.con).
- **Postal addresses** against each country's rules from Google's address data (what Chrome and
  Android forms use): required fields, postcode pattern, states and provinces by code or name, and
  the address written as the country formats it.

Up to 100 phone numbers or emails, or 50 addresses, per call. No key needed.

Built and maintained by [Arhan Canli](https://github.com/arhancanli).

## Install

<!-- install:start -->
[![Install in Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=contact-check&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsImNvbnRhY3QtY2hlY2stbWNwIl19)
[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install_Server-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=contact-check&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22contact-check-mcp%22%5D%7D)
[![Install in Goose](https://block.github.io/goose/img/extension-install-dark.svg)](https://block.github.io/goose/extension?cmd=npx&arg=-y&arg=contact-check-mcp&id=contact-check&name=Contact%20Check&description=Checks%20contact%20data%20the%20way%20a%20careful%20form%20would%3A%20phone%20numbers%20parsed%2C%20validated%20and%20formatted%20for%20their%20country%20with%20their%20type%20(mobile%2C%20fixed%2C%20toll-free)%2C%20email%20addresses%20checked%20for%20syntax%2C%20a%20domain%20that%20accepts%20mail%2C%20disposable%20providers%20and%20likely%20typos%2C%20and%20postal%20addresses%20against%20each%20country's%20required%20fields%2C%20postcode%20pattern%20and%20regions%2C%20formatted%20as%20that%20country%20writes%20them.%20No%20key.)

Needs Node.js 20 or newer. No account or key.

**Claude Code**

```sh
claude mcp add contact-check -- npx -y contact-check-mcp
```

**Claude Desktop**: download `contact-check-mcp-<version>.mcpb` from the [latest release](https://github.com/arhancanli/contact-check-mcp/releases/latest) and open it. The bundle is signed; verify it with `gh attestation verify <file> --repo arhancanli/contact-check-mcp`.

**Any other client** (Windsurf, Zed, Cline, Continue and others), in its MCP config file:

```json
{
  "mcpServers": {
    "contact-check": {
      "command": "npx",
      "args": [
        "-y",
        "contact-check-mcp"
      ]
    }
  }
}
```

**Docker**

```sh
docker build -t contact-check-mcp https://github.com/arhancanli/contact-check-mcp.git && docker run -i --rm contact-check-mcp
```

**Hosted (Streamable HTTP)**: `node src/server.mjs --http` serves stateless MCP at `POST /mcp` (port from `PORT`, default 3000).
<!-- install:end -->

## Example

<!-- example:start -->
An agent calls `check_phones` with:

```json
{
  "numbers": [
    "+44 20 7946 0958",
    "020 7946 0958",
    "+1 202-555-0143",
    "+971 50 123 4567",
    "+1 800 555 0199",
    "12345",
    "+44 20 794"
  ],
  "country": "GB"
}
```

and gets back (recorded from the live server on 2026-09-26):

```json
{
  "valid": 5,
  "results": [
    {
      "input": "+44 20 7946 0958",
      "valid": true,
      "e164": "+442079460958",
      "international": "+44 20 7946 0958",
      "national": "020 7946 0958",
      "country": "GB",
      "calling_code": "+44",
      "type": "fixed_line"
    },
    {
      "input": "020 7946 0958",
      "valid": true,
      "e164": "+442079460958",
      "international": "+44 20 7946 0958",
      "national": "020 7946 0958",
      "country": "GB",
      "calling_code": "+44",
      "type": "fixed_line"
    },
    {
      "input": "+1 202-555-0143",
      "valid": true,
      "e164": "+12025550143",
      "international": "+1 202 555 0143",
      "national": "(202) 555-0143",
      "country": "US",
      "calling_code": "+1",
      "type": "fixed_line_or_mobile",
      "note": "a number reserved for fiction (555-0100 to 555-0199)"
    },
    {
      "input": "+971 50 123 4567",
      "valid": true,
      "e164": "+971501234567",
      "international": "+971 50 123 4567",
      "national": "050 123 4567",
      "country": "AE",
      "calling_code": "+971",
      "type": "mobile"
    },
    {
      "input": "+1 800 555 0199",
      "valid": true,
      "e164": "+18005550199",
      "international": "+1 800 555 0199",
      "national": "(800) 555-0199",
      "country": "US",
      "calling_code": "+1",
      "type": "toll_free",
      "note": "a number reserved for fiction (555-0100 to 555-0199)"
    },
    {
      "input": "12345",
      "valid": false,
      "reason": "too short for its country",
      "country": "GB"
... (8 more lines)
```
<!-- example:end -->

## Tools

<!-- tools:start -->
| Tool | What it does |
| --- | --- |
| `check_addresses` | Checks up to 50 postal addresses against each country's rules (Google's address data): required fields, postcode pattern, state or province, and writes each as the country formats it. Without street and city, returns the country's rules and regions. |
| `check_emails` | Checks up to 100 email addresses without sending mail: syntax, whether the domain exists and accepts mail (MX), disposable providers, role accounts (info@, support@), and likely typos of big providers (gmial.com). Gives the reason when invalid. |
| `check_phones` | Validates up to 100 phone numbers with Google's libphonenumber data: valid for their country or why not, type (mobile, fixed line, toll free, VoIP...), and E.164, international and national forms. country (ISO code) for numbers written without +. |
<!-- tools:end -->

## How it behaves

- Read-only: no tool changes anything outside this process.
- Network: HTTPS only, to the hosts listed in `package.json` under `factory.allowHosts`, with a
  deadline, a size cap and bounded retries. Nothing else is contacted, and nothing is logged
  except unexpected failures (to stderr, without your inputs).
- Phone checks run offline. Email checks ask Cloudflare's DNS-over-HTTPS resolver about the domain
  only (the address itself is never sent anywhere, and no mail is sent). Address rules come from
  Google's address data service, one small file per country, cached for 30 minutes.
- A valid email means the domain accepts mail; whether the mailbox exists cannot be known without
  sending, which this server never does.
- Results are compact JSON with a matching output schema.

## Benchmark

<!-- bench:start -->
Measured 2026-09-26 with gpt-5.4-mini, 10 fixed tasks graded by fixed checks (`bench/tasks.json`, raw results in `bench/results/`).

| Server | Correct | Input tokens | Output tokens | Tool calls | Median time |
| --- | --- | --- | --- | --- | --- |
| This server | 10/10 | 10735 | 285 | 8 | 2.3 s |
| mcp-server-fetch (no open contact-validation server exists; this is what agents use today) | 9/10 | 10584 | 310 | 7 | 2.0 s |
<!-- bench:end -->

## Performance

<!-- perf:start -->
Measured 2026-09-26 from Dubai, home connection against the live upstream, Node 24.19.0 (`bench/perf.json`, `scripts/perf.mjs` in the factory).

| Call | First call | Repeat | Result size |
| --- | --- | --- | --- |
| check_phones: 7 numbers (UK, US, UAE, toll free, fictional, too short) | 5 ms | 0.5 ms | 1,216 chars |
| check_emails: 9 addresses (typos, disposable, role, null MX, no domain) | 1090 ms | 0.6 ms | 1,730 chars |
| check_addresses: 5 addresses (US, UK, bad state and ZIP, UAE, rules only) | 281 ms | 0.6 ms | 681 chars |

First call: a fresh server process, including the TLS connection and the upstream's own time. Repeat: the same call again, answered from the in-process cache, so it shows this server's own overhead.

Tool definitions the model reads on every turn (name, description, input schema): 1,920 characters, against 1,105 for mcp-server-fetch (no open contact-validation server exists; this is what agents use today). The full tool list, with the output schemas and annotations clients use to validate results, is 3,109 characters (1,104 for the alternative).
<!-- perf:end -->

## Data sources

- [libphonenumber-js](https://gitlab.com/catamphetamine/libphonenumber-js) (MIT), Google's
  [libphonenumber](https://github.com/google/libphonenumber) metadata.
- [Google address data](https://github.com/google/libaddressinput) (Apache 2.0), as served for
  Chrome's autofill.
- [disposable-email-domains](https://github.com/disposable-email-domains/disposable-email-domains) (CC0).
- DNS over HTTPS from [Cloudflare](https://developers.cloudflare.com/1.1.1.1/encryption/dns-over-https/).

## More MCP servers by Arhan Canli

<!-- family:start -->
- [Actions Check](https://github.com/arhancanli/actions-check-mcp): Checks GitHub Actions workflows: outdated actions, old Node runtimes, retired runners, injection.
- [Citation Check](https://github.com/arhancanli/citation-check-mcp): Verifies citations: finds fabricated or mismatched references and retractions, returns clean BibTeX.
- [Config Check](https://github.com/arhancanli/config-check-mcp): Validates config files against their official schemas: tsconfig, compose, workflows, 1,400+ more.
- [Cron Check](https://github.com/arhancanli/cron-check-mcp): Explains cron expressions, lists next run times in any time zone, converts between cron dialects.
- [Dockerfile Check](https://github.com/arhancanli/dockerfile-check-mcp): Checks Dockerfiles: build-breaking mistakes, base image tags that exist, digests, platforms, EOL.
- [Domain Health](https://github.com/arhancanli/domain-health-mcp): Email and domain checks: SPF lookup limits, DKIM keys, DMARC, DNS records, registration expiry.
- [Drug Label](https://github.com/arhancanli/drug-label-mcp): FDA drug label answers with section citations, RxNorm name resolution, recalls and shortages.
- [End of Life](https://github.com/arhancanli/end-of-life-mcp): Is this version still supported? EOL dates, latest patch and upgrade target for 470+ products.
- [The whole collection](https://github.com/arhancanli/mcp-factory#servers), 11 more
<!-- family:end -->

## License

MIT, Copyright (c) 2026 Arhan Canli.
