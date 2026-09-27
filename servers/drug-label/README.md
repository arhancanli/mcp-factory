# Drug Label

<!-- badges:start -->
[![CI](https://github.com/arhancanli/drug-label-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/arhancanli/drug-label-mcp/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/drug-label-mcp)](https://www.npmjs.com/package/drug-label-mcp)
[![downloads](https://img.shields.io/npm/dw/drug-label-mcp)](https://www.npmjs.com/package/drug-label-mcp)
[![OpenSSF Scorecard](https://api.securityscorecards.dev/projects/github.com/arhancanli/drug-label-mcp/badge)](https://scorecard.dev/viewer/?uri=github.com/arhancanli/drug-label-mcp)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
<!-- badges:end -->

Answers medication questions from the official FDA label, in the label's own words, with the label it
came from: which manufacturer, which version, from when, and a link to read it on DailyMed. Also
resolves any drug name, brand, misspelling or NDC through RxNorm, and reports FDA recalls and drug
shortages.

A model asked about a drug answers from memory, and memory is out of date: labels change, boxed
warnings are added, and interactions are revised. Drug Label reads the current label instead, and
picks the right one: a common generic has hundreds of labels on DailyMed, most of them repackaged
copies, so it chooses from manufacturers only (openFDA's original-packager index), with the brand's
own NDA label first, and always says which label it used and how many others exist.

It is careful where mistakes are dangerous:

- Look-alike names cause medication errors, so a misspelling is corrected only when one name is
  clearly meant. When two names are equally close, it refuses and asks which drug is meant.
- A missing section is an explicit answer ("this label has no boxed warning section"), never a
  silent empty result.
- Interaction answers are what each label says. NLM retired its drug-interaction API in 2024; this
  server does not pretend to replace it, and a label not mentioning an interaction does not mean
  there is none.

This is label information, not medical advice. Confirm anything that affects treatment with a
pharmacist or prescriber.

No account or key needed. Built and maintained by [Arhan Canli](https://github.com/arhancanli).

## Install

<!-- install:start -->
[![Install in Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=drug-label&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsImRydWctbGFiZWwtbWNwIl19)
[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install_Server-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=drug-label&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22drug-label-mcp%22%5D%7D)
[![Install in Goose](https://block.github.io/goose/img/extension-install-dark.svg)](https://block.github.io/goose/extension?cmd=npx&arg=-y&arg=drug-label-mcp&id=drug-label&name=Drug%20Label&description=Answers%20medication%20questions%20from%20the%20official%20FDA%20label%20text%20on%20DailyMed%20with%20section-level%20citations%20(boxed%20warning%2C%20indications%2C%20contraindications%2C%20warnings%2C%20interactions%2C%20pregnancy%2C%20dosing)%2C%20resolves%20any%20drug%20name%20or%20NDC%20through%20RxNorm%2C%20and%20reports%20openFDA%20recalls%20and%20shortages.)

Needs Node.js 20 or newer. No account or key.

**Claude Code**

```sh
claude mcp add drug-label -- npx -y drug-label-mcp
```

**Claude Desktop**: download `drug-label-mcp-<version>.mcpb` from the [latest release](https://github.com/arhancanli/drug-label-mcp/releases/latest) and open it. The bundle is signed; verify it with `gh attestation verify <file> --repo arhancanli/drug-label-mcp`.

**Any other client** (Windsurf, Zed, Cline, Continue and others), in its MCP config file:

```json
{
  "mcpServers": {
    "drug-label": {
      "command": "npx",
      "args": [
        "-y",
        "drug-label-mcp"
      ]
    }
  }
}
```

**Docker**

```sh
docker build -t drug-label-mcp https://github.com/arhancanli/drug-label-mcp.git && docker run -i --rm drug-label-mcp
```

**Hosted (Streamable HTTP)**: `node src/server.mjs --http` serves stateless MCP at `POST /mcp` (port from `PORT`, default 3000).
<!-- install:end -->

## Example

<!-- example:start -->
An agent calls `find_drug` with:

```json
{
  "name": "atorvastatin"
}
```

and gets back (recorded from the live server on 2026-09-26):

```json
{
  "rxcui": "83367",
  "name": "atorvastatin",
  "term_type": "IN",
  "ingredients": [
    "atorvastatin",
    "atorvastatin / ezetimibe",
    "amlodipine / atorvastatin"
  ],
  "brands": [
    "Lipitor",
    "Atorvaliq",
    "Caduet"
  ],
  "classes": [
    {
      "name": "Hydroxymethylglutaryl-CoA Reductase Inhibitors",
      "type": "MOA"
    },
    {
      "name": "HMG-CoA Reductase Inhibitor",
      "type": "EPC"
    }
  ],
  "labels_total": 25,
  "labels": [
    {
      "setid": "a60cc18b-0631-4cf0-b021-9f52224ece65",
      "brand": "Lipitor",
      "generic": "atorvastatin calcium",
      "manufacturer": "Viatris Specialty LLC",
      "application": "NDA020702",
      "category": "NDA",
      "form": "TABLET, FILM COATED",
      "since": "2024-05-01"
    },
    {
      "setid": "d9adb9e4-c495-9530-e5e3-7e3b01d53e4c",
      "brand": "ATORVASTATIN CALCIUM",
      "generic": "ATORVASTATIN CALCIUM",
      "manufacturer": "Apotex Corp.",
      "application": "ANDA090548",
      "category": "ANDA",
      "form": "TABLET, FILM COATED",
      "since": "2012-05-29"
    },
    {
      "setid": "901550e6-22be-68c9-eb86-f85a9c9dd998",
      "brand": "Atorvastatin Calcium",
      "generic": "Atorvastatin Calcium",
      "manufacturer": "Dr. Reddy's Laboratories Limited",
      "application": "ANDA091650",
      "category": "ANDA",
      "form": "TABLET",
      "since": "2012-07-17"
    },
    {
      "setid": "6ccdb6f3-22c7-5b48-46bc-ce4a4c65eb4d",
      "brand": "Atorvastatin Calcium",
      "generic": "Atorvastatin Calcium",
... (18 more lines)
```
<!-- example:end -->

## Tools

<!-- tools:start -->
| Tool | What it does |
| --- | --- |
| `find_drug` | Resolves a brand or generic name, misspelling or NDC through RxNorm: ingredients, brands, FDA classes, and the best manufacturer labels (not repackagers) with set ids. Never guesses between look-alike names. |
| `label_section` | Returns one topic of the official FDA label as the label's own text under its headings, citing the label's set id, version and date. Says so when the label has no such section. |
| `recalls_shortages` | FDA drug recalls (class, reason, status, date, product) and shortage records (status, company, reason) for a drug, newest first, from openFDA. |
| `search_label` | Finds every paragraph of the official FDA label that mentions a term (another drug, grapefruit, alcohol, a condition), with its section heading and topic. |
<!-- tools:end -->

Topics for `label_section`: `boxed_warning`, `indications`, `dosage`, `contraindications`,
`warnings`, `interactions`, `pregnancy_lactation`, `specific_populations`, `adverse_reactions`,
`overdosage`, `description`, `how_supplied`, `clinical_pharmacology`. Each maps to the FDA's section
codes, including the older WARNINGS and PRECAUTIONS layout and OTC Drug Facts labels.

## How it behaves

- Read-only: no tool changes anything outside this process.
- Network: HTTPS only, to the hosts listed in `package.json` under `factory.allowHosts`, with a
  deadline, a size cap and bounded retries; a stalled read is retried. Nothing else is contacted, and
  nothing is logged except unexpected failures (to stderr, without your inputs).
- Keeps to each source's limits (RxNav asks for at most 20 requests per second; openFDA allows 240
  per minute without a key) and caches for 12 hours, as NLM asks. Parsed labels are kept in memory.
- Label text keeps lists as items and tables row by row, repeating a cell that spans rows so each
  row reads on its own. Long answers are cut at 12,000 characters with a count of what was left out.
- Results are compact JSON with a matching output schema.

## Benchmark

<!-- bench:start -->
Measured 2026-09-26 with gpt-5.4-mini, 10 fixed tasks graded by fixed checks (`bench/tasks.json`, raw results in `bench/results/`).

| Server | Correct | Input tokens | Output tokens | Tool calls | Median time |
| --- | --- | --- | --- | --- | --- |
| This server | 10/10 | 23729 | 459 | 14 | 4.1 s |
| @ythalorossy/openfda, the most downloaded openFDA server | 7/10 | 118095 | 643 | 14 | 2.2 s |
<!-- bench:end -->

## Performance

<!-- perf:start -->
Measured 2026-09-26 from Dubai, home connection against the live upstream, Node 24.19.0 (`bench/perf.json`, `scripts/perf.mjs` in the factory).

| Call | First call | Repeat | Result size |
| --- | --- | --- | --- |
| find_drug: atorvastatin (brand and generic manufacturers ranked) | 3673 ms | 1.2 ms | 1,560 chars |
| find_drug: a misspelled name | 4053 ms | 0.9 ms | 1,591 chars |
| label_section: warfarin boxed warning | 4171 ms | 0.5 ms | 1,437 chars |
| label_section: Lipitor boxed warning (none) | 4192 ms | 0.3 ms | 508 chars |
| search_label: Lipitor and grapefruit | 4694 ms | 0.4 ms | 3,766 chars |
| label_section: metformin contraindications | 4468 ms | 0.6 ms | 1,257 chars |
| recalls_shortages: metformin | 2352 ms | 0.7 ms | 4,766 chars |

First call: a fresh server process, including the TLS connection and the upstream's own time. Repeat: the same call again, answered from the in-process cache, so it shows this server's own overhead.

Tool definitions the model reads on every turn (name, description, input schema): 1,958 characters, against 23,915 for @ythalorossy/openfda, the most downloaded openFDA server. The full tool list, with the output schemas and annotations clients use to validate results, is 3,819 characters (24,351 for the alternative).
<!-- perf:end -->

## Data sources

- [DailyMed](https://dailymed.nlm.nih.gov) (National Library of Medicine): FDA label text (SPL).
- [RxNorm](https://www.nlm.nih.gov/research/umls/rxnorm/) through RxNav: drug names, ingredients,
  brands, NDCs, FDA pharmacologic classes. Only RxNorm's own content is used.
- [openFDA](https://open.fda.gov): the NDC directory (to find manufacturers' labels), recall
  enforcement reports and drug shortages.

All three are US government services. They do not endorse this server.

## More MCP servers by Arhan Canli

<!-- family:start -->
- [Actions Check](https://github.com/arhancanli/actions-check-mcp): Checks GitHub Actions workflows: outdated actions, old Node runtimes, retired runners, injection.
- [Citation Check](https://github.com/arhancanli/citation-check-mcp): Verifies citations: finds fabricated or mismatched references and retractions, returns clean BibTeX.
- [Config Check](https://github.com/arhancanli/config-check-mcp): Validates config files against their official schemas: tsconfig, compose, workflows, 1,400+ more.
- [Contact Check](https://github.com/arhancanli/contact-check-mcp): Validates and formats phone numbers, email addresses and postal addresses for any country.
- [Cron Check](https://github.com/arhancanli/cron-check-mcp): Explains cron expressions, lists next run times in any time zone, converts between cron dialects.
- [Dockerfile Check](https://github.com/arhancanli/dockerfile-check-mcp): Checks Dockerfiles: build-breaking mistakes, base image tags that exist, digests, platforms, EOL.
- [Domain Health](https://github.com/arhancanli/domain-health-mcp): Email and domain checks: SPF lookup limits, DKIM keys, DMARC, DNS records, registration expiry.
- [End of Life](https://github.com/arhancanli/end-of-life-mcp): Is this version still supported? EOL dates, latest patch and upgrade target for 470+ products.
- [The whole collection](https://github.com/arhancanli/mcp-factory#servers), 12 more
<!-- family:end -->

## License

MIT, Copyright (c) 2026 Arhan Canli.
