# Citation Check

<!-- badges:start -->
[![CI](https://github.com/arhancanli/citation-check-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/arhancanli/citation-check-mcp/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/citation-check-mcp)](https://www.npmjs.com/package/citation-check-mcp)
[![downloads](https://img.shields.io/npm/dw/citation-check-mcp)](https://www.npmjs.com/package/citation-check-mcp)
[![OpenSSF Scorecard](https://api.securityscorecards.dev/projects/github.com/arhancanli/citation-check-mcp/badge)](https://scorecard.dev/viewer/?uri=github.com/arhancanli/citation-check-mcp)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
<!-- badges:end -->

Checks every reference in a paper, brief or bibliography before anyone relies on it: does the cited
work exist, does the citation describe it correctly, and has it been retracted?

Language models fabricate references, and fabricated references now reach court filings and journal
submissions (Damien Charlotin's database of AI-hallucination cases in courts lists more than two
thousand decisions). The existing checkers either stop at "is this DOI valid" or miss retractions.
Citation Check gives each reference a verdict an agent can act on:

| Verdict | Meaning |
| --- | --- |
| `verified` | The work exists and the citation's title, first author and year agree with the record |
| `mismatch` | The work was found, but the citation gets a field wrong, or its DOI belongs to a different paper |
| `not_found` | No source holds a matching work: possibly fabricated, or a book, thesis or very new work that is not indexed |
| `unverifiable` | The DOI is registered, but no source returns metadata to compare against |

Every result also carries flags such as `retracted`, `partially_retracted`, `expression_of_concern`,
`corrected`, `doi_added`, `identifier_points_to_different_work`, `doi_not_registered` and
`published_version_exists`, with the notice DOIs and dates.

It reads pasted reference lists in any common style (Vancouver, APA, numbered, one per line) and
BibTeX, and returns corrected BibTeX that keeps your citation keys. No account or key needed.

Built and maintained by [Arhan Canli](https://github.com/arhancanli).

## Install

<!-- install:start -->
[![Install in Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=citation-check&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsImNpdGF0aW9uLWNoZWNrLW1jcCJdfQ%3D%3D)
[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install_Server-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=citation-check&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22citation-check-mcp%22%5D%7D)
[![Install in Goose](https://block.github.io/goose/img/extension-install-dark.svg)](https://block.github.io/goose/extension?cmd=npx&arg=-y&arg=citation-check-mcp&id=citation-check&name=Citation%20Check&description=Checks%20reference%20lists%20and%20BibTeX%20against%20Crossref%2C%20OpenAlex%2C%20arXiv%2C%20PubMed%20and%20DataCite%3A%20flags%20fabricated%20or%20mismatched%20citations%20field%20by%20field%2C%20flags%20retractions%2C%20and%20returns%20corrected%20BibTeX%20with%20DOIs.)

Needs Node.js 20 or newer. No account or key.

**Claude Code**

```sh
claude mcp add citation-check -- npx -y citation-check-mcp
```

**Claude Desktop**: download `citation-check-mcp-<version>.mcpb` from the [latest release](https://github.com/arhancanli/citation-check-mcp/releases/latest) and open it. The bundle is signed; verify it with `gh attestation verify <file> --repo arhancanli/citation-check-mcp`.

**Any other client** (Windsurf, Zed, Cline, Continue and others), in its MCP config file:

```json
{
  "mcpServers": {
    "citation-check": {
      "command": "npx",
      "args": [
        "-y",
        "citation-check-mcp"
      ]
    }
  }
}
```

**Docker**

```sh
docker build -t citation-check-mcp https://github.com/arhancanli/citation-check-mcp.git && docker run -i --rm citation-check-mcp
```

**Hosted (Streamable HTTP)**: `node src/server.mjs --http` serves stateless MCP at `POST /mcp` (port from `PORT`, default 3000).
<!-- install:end -->

### Optional settings

- `CROSSREF_MAILTO`: your own email address. Crossref then serves requests from its faster "polite"
  pool (3 searches per second instead of 1). Nothing else is done with it.
- `OPENALEX_API_KEY`: a free OpenAlex key raises its daily search allowance. Without one, OpenAlex is
  used only as the last fallback and the check still completes when its allowance is spent.

## Example

<!-- example:start -->
An agent calls `check_references` with:

```json
{
  "text": "1. Wakefield AJ, Murch SH, Anthony A, et al. Ileal-lymphoid-nodular hyperplasia, non-specific colitis, and pervasive developmental disorder in children. Lancet. 1998;351(9103):637-641.\n2. Kucsko G, Maurer PC, Yao NY, et al. Nanometre-scale thermometry in a living cell. Nature. 2013;500:54-58. doi:10.1038/nature12373\n3. Vaswani A, Shazeer N, Parmar N, et al. Attention is all you need. In: Advances in Neural Information Processing Systems. 2017.\n4. Smith J, Doe R. Quantum entanglement improves photosynthesis yields in wheat. Nature Plants. 2021;7:112-119. doi:10.1038/nature12373\n5. Kucsko G, Maurer PC. Nanometre-scale thermometry in a living cell. Nature. 2011;500:54-58.\n6. Chen L, Okafor B. Neural cartography of hallucinated citations in legal briefs. Journal of Imaginary Studies. 2022;14(2):33-47."
}
```

and gets back (recorded from the live server on 2026-09-26):

```json
{
  "counts": {
    "verified": 3,
    "mismatch": 2,
    "not_found": 1,
    "unverifiable": 0,
    "retracted": 1
  },
  "results": [
    {
      "n": 1,
      "cited": "Wakefield AJ, Murch SH, Anthony A, et al. Ileal-lymphoid-nodular hyperplasia, non-specific colitis, and pervasive developmental disorder in children. Lancet....",
      "verdict": "verified",
      "flags": [
        "doi_added",
        "corrected",
        "retracted"
      ],
      "matched": {
        "doi": "10.1016/s0140-6736(97)11096-0",
        "title": "RETRACTED: Ileal-lymphoid-nodular hyperplasia, non-specific colitis, and pervasive developmental disorder in children",
        "authors": "Wakefield, Murch, Anthony et al.",
        "year": 1998,
        "venue": "The Lancet",
        "url": "https://doi.org/10.1016/s0140-6736(97)11096-0",
        "source": "crossref"
      },
      "notices": [
        {
          "type": "correction",
          "notice_doi": "10.1016/s0140-6736(04)15715-2",
          "date": "2004-03-06"
        },
        {
          "type": "retraction",
          "notice_doi": "10.1016/s0140-6736(10)60175-4",
          "date": "2010-02-06"
        }
      ]
    },
    {
      "n": 2,
      "cited": "Kucsko G, Maurer PC, Yao NY, et al. Nanometre-scale thermometry in a living cell. Nature. 2013;500:54-58. doi:10.1038/nature12373",
      "verdict": "verified",
      "matched": {
        "doi": "10.1038/nature12373",
        "title": "Nanometre-scale thermometry in a living cell",
        "authors": "Kucsko, Maurer, Yao et al.",
        "year": 2013,
        "venue": "Nature",
        "url": "https://doi.org/10.1038/nature12373",
        "source": "crossref"
      }
    },
    {
      "n": 3,
      "cited": "Vaswani A, Shazeer N, Parmar N, et al. Attention is all you need. In: Advances in Neural Information Processing Systems. 2017.",
      "verdict": "verified",
      "flags": [
        "doi_added"
... (60 more lines)
```
<!-- example:end -->

## Tools

<!-- tools:start -->
| Tool | What it does |
| --- | --- |
| `check_references` | Checks up to 30 citations (a pasted reference list, one per line or numbered, or BibTeX) against Crossref, DataCite, PubMed and OpenAlex. Verdict each: verified, mismatch (wrong field, or DOI of another work), not_found (possibly fabricated) or unverifiable; flags retractions and corrections. bibtex=true adds corrected BibTeX. |
| `check_retractions` | Fast batch check of up to 200 DOIs for retractions, partial retractions, expressions of concern and corrections (Crossref, including Retraction Watch data). Status each: retracted, partially_retracted, expression_of_concern, corrected, none or not_in_crossref. |
| `lookup_work` | Returns the record for a DOI, arXiv id, PMID, link, title or full citation: authors, year, venue, pages, DOI, retraction and correction notices, a newer published version if one exists, and BibTeX. |
<!-- tools:end -->

## How it works

1. Identifiers first, in batches: DOIs through Crossref (40 per request), arXiv ids through DataCite,
   PMIDs through PubMed, and any DOI that neither Crossref nor DataCite knows through doi.org, which
   says whether any registration agency has it at all.
2. Citations without an identifier, or whose DOI points at a different work, are searched in
   Crossref, then by title (and first author) in DataCite, which holds arXiv, then in OpenAlex.
3. The best candidate is chosen by comparing title, first author and year, never by a source's own
   ranking alone: Crossref ranks a same-titled letter above the original paper for some queries, and
   both Crossref and OpenAlex rank reposts of famous papers above the original.
4. Retractions, corrections and expressions of concern come from Crossref, which includes the
   Retraction Watch database.

## How it behaves

- Read-only: no tool changes anything outside this process.
- Network: HTTPS only, to the hosts listed in `package.json` under `factory.allowHosts`, with a
  deadline, a size cap and bounded retries. Nothing else is contacted, and nothing is logged
  except unexpected failures (to stderr, without your inputs).
- Keeps to each source's published limits (Crossref: 5 lookups and 1 search per second, one at a
  time, or its polite-pool limits with `CROSSREF_MAILTO`; NCBI: 3 per second), and caches answers
  for 30 minutes.
- Up to 30 references per `check_references` call. A reference with a DOI costs a fraction of one
  without, so free-text lists take about a second per reference on Crossref's public pool.
- Results are compact JSON with a matching output schema.

## Benchmark

<!-- bench:start -->
Measured 2026-09-26 with gpt-5.4-mini, 10 fixed tasks graded by fixed checks (`bench/tasks.json`, raw results in `bench/results/`).

| Server | Correct | Input tokens | Output tokens | Tool calls | Median time |
| --- | --- | --- | --- | --- | --- |
| This server | 9/10 | 16205 | 679 | 16 | 5.7 s |
| doi-mcp, the most starred citation verifier | 9/10 | 17165 | 630 | 12 | 3.9 s |
<!-- bench:end -->

## Performance

<!-- perf:start -->
Measured 2026-09-26 from Dubai, home connection against the live upstream, Node 24.19.0 (`bench/perf.json`, `scripts/perf.mjs` in the factory).

| Call | First call | Repeat | Result size |
| --- | --- | --- | --- |
| check_references: 6 citations (retracted, invented, wrong year, borrowed DOI, arXiv-only) | 9594 ms | 3.1 ms | 2,894 chars |
| check_references: 2 BibTeX entries with corrected BibTeX | 7491 ms | 1.8 ms | 1,059 chars |
| lookup_work: arXiv id | 795 ms | 0.3 ms | 717 chars |
| lookup_work: PMID of a retracted paper | 3394 ms | 0.4 ms | 1,281 chars |
| lookup_work: DOI link | 763 ms | 0.3 ms | 1,356 chars |
| check_retractions: 5 inputs | 1485 ms | 0.6 ms | 987 chars |

First call: a fresh server process, including the TLS connection and the upstream's own time. Repeat: the same call again, answered from the in-process cache, so it shows this server's own overhead.

Tool definitions the model reads on every turn (name, description, input schema): 1,523 characters, against 2,550 for doi-mcp, the most starred citation verifier. The full tool list, with the output schemas and annotations clients use to validate results, is 2,979 characters (2,913 for the alternative).
<!-- perf:end -->

## Data sources

- [Crossref](https://www.crossref.org) REST API: bibliographic metadata and update notices, including
  the [Retraction Watch](https://retractionwatch.com) database that Crossref makes openly available.
- [DataCite](https://datacite.org) REST API: arXiv and other DataCite DOIs.
- [PubMed](https://pubmed.ncbi.nlm.nih.gov) through NCBI E-utilities.
- [OpenAlex](https://openalex.org): search fallback (CC0 data).
- [doi.org](https://www.doi.org) handle API: whether a DOI is registered at all.

## More MCP servers by Arhan Canli

<!-- family:start -->
- [Drug Label](https://github.com/arhancanli/drug-label-mcp): FDA drug label answers with section citations, RxNorm name resolution, recalls and shortages.
- [End of Life](https://github.com/arhancanli/end-of-life-mcp): Is this version still supported? EOL dates, latest patch and upgrade target for 470+ products.
- [Internet Standards](https://github.com/arhancanli/internet-standards-mcp): RFC sections, status, obsoleted-by chains, errata and IANA registries for coding agents.
- [Package Truth](https://github.com/arhancanli/package-truth-mcp): Checks packages exist before install: version, deprecation, vulnerabilities, licence. 7 ecosystems.
- [Recall Check](https://github.com/arhancanli/recall-check-mcp): One recall check across CPSC, FDA and NHTSA: match by name, model number, UPC or VIN.
- [Satellite Imagery](https://github.com/arhancanli/satellite-imagery-mcp): Find the clearest Sentinel-2, Landsat, Sentinel-1 or NAIP scene for any place, with band links.
- [Vuln Priority](https://github.com/arhancanli/vuln-priority-mcp): Which vulnerabilities to fix first: CISA KEV, EPSS, CVSS and CISA's SSVC decisions in one ranking.
- [World Time](https://github.com/arhancanli/world-time-mcp): Time anywhere, DST-safe conversions, holidays for 200+ countries, business days and meeting slots.
- [The whole collection](https://github.com/arhancanli/mcp-factory#servers)
<!-- family:end -->

## License

MIT, Copyright (c) 2026 Arhan Canli.
