# Satellite Imagery

<!-- badges:start -->
[![CI](https://github.com/arhancanli/satellite-imagery-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/arhancanli/satellite-imagery-mcp/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/satellite-imagery-mcp)](https://www.npmjs.com/package/satellite-imagery-mcp)
[![downloads](https://img.shields.io/npm/dw/satellite-imagery-mcp)](https://www.npmjs.com/package/satellite-imagery-mcp)
[![OpenSSF Scorecard](https://api.securityscorecards.dev/projects/github.com/arhancanli/satellite-imagery-mcp/badge)](https://scorecard.dev/viewer/?uri=github.com/arhancanli/satellite-imagery-mcp)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
<!-- badges:end -->

Find the right satellite image of any place and time: the clearest Sentinel-2 or Landsat scene of a
field, a city block or a coastline, Sentinel-1 radar when it is cloudy, or NAIP aerial photos of the
US, with preview images, true-colour and band download links, and the licence each needs.

A catalogue search returns every scene whose footprint touches your area, including slivers at the
edge of a tile, sorted by whatever the catalogue likes. Satellite Imagery measures how much of your
area each scene actually covers and ranks by that first, then by cloud cover, then by date (or by
clearness or recency if you ask), so the first result is the one you would have picked by hand.

- `find_imagery`: an area (bounding box, or a point and radius), a date range, a collection and a
  cloud limit in; ranked scenes out, each with its date, cloud cover, share of your area covered,
  preview, true-colour image and STAC item link.
- `scene_assets`: every band and file of one scene, with band name, wavelength, resolution and URL.

It is explicit about what things cost: Landsat, Sentinel-1 and NAIP files sit in requester-pays AWS
buckets, so downloading them is billed to the downloader, and those scenes are flagged. Each answer
carries the credit line its data provider asks for.

No account or key needed. Built and maintained by [Arhan Canli](https://github.com/arhancanli).

## Install

<!-- install:start -->
[![Install in Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=satellite-imagery&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsInNhdGVsbGl0ZS1pbWFnZXJ5LW1jcCJdfQ%3D%3D)
[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install_Server-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=satellite-imagery&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22satellite-imagery-mcp%22%5D%7D)
[![Install in Goose](https://block.github.io/goose/img/extension-install-dark.svg)](https://block.github.io/goose/extension?cmd=npx&arg=-y&arg=satellite-imagery-mcp&id=satellite-imagery&name=Satellite%20Imagery&description=Finds%20the%20best%20satellite%20scenes%20for%20a%20place%20and%20time%20from%20Earth%20Search%20(Sentinel-2%2C%20Landsat%2C%20Sentinel-1%20radar%20and%20NAIP)%2C%20ranked%20by%20how%20much%20of%20your%20area%20each%20covers%2C%20cloud%20cover%20and%20date%2C%20with%20previews%2C%20band%20download%20links%20and%20licences.)

Needs Node.js 20 or newer. No account or key.

**Claude Code**

```sh
claude mcp add satellite-imagery -- npx -y satellite-imagery-mcp
```

**Claude Desktop**: download `satellite-imagery-mcp-<version>.mcpb` from the [latest release](https://github.com/arhancanli/satellite-imagery-mcp/releases/latest) and open it. The bundle is signed; verify it with `gh attestation verify <file> --repo arhancanli/satellite-imagery-mcp`.

**Any other client** (Windsurf, Zed, Cline, Continue and others), in its MCP config file:

```json
{
  "mcpServers": {
    "satellite-imagery": {
      "command": "npx",
      "args": [
        "-y",
        "satellite-imagery-mcp"
      ]
    }
  }
}
```

**Docker**

```sh
docker build -t satellite-imagery-mcp https://github.com/arhancanli/satellite-imagery-mcp.git && docker run -i --rm satellite-imagery-mcp
```

**Hosted (Streamable HTTP)**: `node src/server.mjs --http` serves stateless MCP at `POST /mcp` (port from `PORT`, default 3000).
<!-- install:end -->

## Example

<!-- example:start -->
An agent calls `find_imagery` with:

```json
{
  "lat": 25.197,
  "lon": 55.274,
  "start": "2026-08-01",
  "end": "2026-09-26",
  "limit": 3
}
```

and gets back (recorded from the live server on 2026-09-26):

```json
{
  "collection": "Sentinel-2 surface reflectance (Collection 1, L2A), 10 m, every 5 days",
  "area": [
    55.264072,
    25.188017,
    55.283928,
    25.205983
  ],
  "matched": 14,
  "scenes": [
    {
      "id": "S2B_T40RCN_20260830T065854_L2A",
      "date": "2026-08-30T07:02:38",
      "cloud_cover": 0,
      "area_covered_pct": 100,
      "platform": "sentinel-2b",
      "thumbnail": "https://e84-earth-search-sentinel-data.s3.us-west-2.amazonaws.com/sentinel-2-c1-l2a/40/R/CN/2026/8/S2B_T40RCN_20260830T065854_L2A/L2A_PVI.jpg",
      "true_color": "https://e84-earth-search-sentinel-data.s3.us-west-2.amazonaws.com/sentinel-2-c1-l2a/40/R/CN/2026/8/S2B_T40RCN_20260830T065854_L2A/TCI.tif",
      "item": "https://earth-search.aws.element84.com/v1/collections/sentinel-2-c1-l2a/items/S2B_T40RCN_20260830T065854_L2A"
    },
    {
      "id": "S2B_T40RCN_20260919T065429_L2A",
      "date": "2026-09-19T07:02:39",
      "cloud_cover": 0,
      "area_covered_pct": 100,
      "platform": "sentinel-2b",
      "thumbnail": "https://e84-earth-search-sentinel-data.s3.us-west-2.amazonaws.com/sentinel-2-c1-l2a/40/R/CN/2026/9/S2B_T40RCN_20260919T065429_L2A/L2A_PVI.jpg",
      "true_color": "https://e84-earth-search-sentinel-data.s3.us-west-2.amazonaws.com/sentinel-2-c1-l2a/40/R/CN/2026/9/S2B_T40RCN_20260919T065429_L2A/TCI.tif",
      "item": "https://earth-search.aws.element84.com/v1/collections/sentinel-2-c1-l2a/items/S2B_T40RCN_20260919T065429_L2A"
    },
    {
      "id": "S2B_T40RCN_20260909T070216_L2A",
      "date": "2026-09-09T07:02:38",
      "cloud_cover": 0,
      "area_covered_pct": 100,
      "platform": "sentinel-2b",
      "thumbnail": "https://e84-earth-search-sentinel-data.s3.us-west-2.amazonaws.com/sentinel-2-c1-l2a/40/R/CN/2026/9/S2B_T40RCN_20260909T070216_L2A/L2A_PVI.jpg",
      "true_color": "https://e84-earth-search-sentinel-data.s3.us-west-2.amazonaws.com/sentinel-2-c1-l2a/40/R/CN/2026/9/S2B_T40RCN_20260909T070216_L2A/TCI.tif",
      "item": "https://earth-search.aws.element84.com/v1/collections/sentinel-2-c1-l2a/items/S2B_T40RCN_20260909T070216_L2A"
    }
  ],
  "examined": 14,
  "licence": "Copernicus Sentinel data: free and open use; credit 'Contains modified Copernicus Sentinel data [year]'."
}
```
<!-- example:end -->

## Tools

<!-- tools:start -->
| Tool | What it does |
| --- | --- |
| `find_imagery` | Finds satellite scenes of an area (bbox or lat/lon) between two dates: Sentinel-2, Landsat, Sentinel-1 radar or NAIP. Ranks by how much of the area each scene covers, cloud cover and date, and returns preview, true-colour image and STAC item links with the data licence. |
| `scene_assets` | Lists the bands and files of one scene found with find_imagery: key, title, common band name, resolution, media type and download URL, with the scene's date, cloud cover, projection and footprint bbox. |
<!-- tools:end -->

Collections: `sentinel-2` (Sentinel-2 Collection 1 L2A surface reflectance, 10 m, about every 5
days), `landsat` (Landsat 8 and 9 Collection 2 Level 2, 30 m), `sentinel-1` (radar, through cloud and
at night), `naip` (US aerial, about 1 m, 2010 to 2022).

## How it behaves

- Read-only: no tool changes anything outside this process, and nothing is downloaded: results are
  links.
- Network: HTTPS only, to the hosts listed in `package.json` under `factory.allowHosts`, with a
  deadline, a size cap and bounded retries; a stalled read is retried. Nothing else is contacted, and
  nothing is logged except unexpected failures (to stderr, without your inputs).
- The 50 best scenes by the catalogue's own order (clearest for optical collections, newest for
  radar) are ranked, and the answer says when more matched.
- Coverage is computed in longitude and latitude scaled by the cosine of the latitude, which is
  accurate for the areas scene selection deals with; areas crossing the antimeridian are not
  supported.
- Results are compact JSON with a matching output schema.

## Benchmark

<!-- bench:start -->
Measured 2026-09-26 with gpt-5.4-mini, 10 fixed tasks graded by fixed checks (`bench/tasks.json`, raw results in `bench/results/`).

| Server | Correct | Input tokens | Output tokens | Tool calls | Median time |
| --- | --- | --- | --- | --- | --- |
| This server | 10/10 | 20400 | 650 | 9 | 3.0 s |
| planetary-computer-mcp (run with mcp<2 pinned; its default install fails to start) | 10/10 | 23709 | 980 | 14 | 3.4 s |
<!-- bench:end -->

## Performance

<!-- perf:start -->
Measured 2026-09-26 from Dubai, home connection against the live upstream, Node 24.19.0 (`bench/perf.json`, `scripts/perf.mjs` in the factory).

| Call | First call | Repeat | Result size |
| --- | --- | --- | --- |
| find_imagery: Sentinel-2 around a point in Dubai, 8 weeks | 2157 ms | 1.4 ms | 1,971 chars |
| find_imagery: Landsat over San Francisco, a summer | 1249 ms | 0.8 ms | 1,647 chars |
| find_imagery: Sentinel-1 radar over London, newest first | 1273 ms | 1 ms | 1,292 chars |
| scene_assets: one Sentinel-2 scene | 726 ms | 0.7 ms | 5,602 chars |
| find_imagery: open ocean, no cloud allowed | 451 ms | 0.3 ms | 441 chars |

First call: a fresh server process, including the TLS connection and the upstream's own time. Repeat: the same call again, answered from the in-process cache, so it shows this server's own overhead.

Tool definitions the model reads on every turn (name, description, input schema): 1,731 characters, against 2,776 for planetary-computer-mcp (run with mcp<2 pinned; its default install fails to start). The full tool list, with the output schemas and annotations clients use to validate results, is 2,641 characters (4,812 for the alternative).
<!-- perf:end -->

## Data sources

- [Earth Search](https://element84.com/earth-search/) by Element 84, a public STAC API over the AWS
  Open Data Registry copies of Sentinel-2, Landsat Collection 2, Sentinel-1 and NAIP.
- Licences: Copernicus Sentinel data are free and open (credit "Contains modified Copernicus Sentinel
  data [year]"); Landsat data from the USGS and NAIP from the USDA are public domain.

## More MCP servers by Arhan Canli

<!-- family:start -->
- [Actions Check](https://github.com/arhancanli/actions-check-mcp): Checks GitHub Actions workflows: outdated actions, old Node runtimes, retired runners, injection.
- [Citation Check](https://github.com/arhancanli/citation-check-mcp): Verifies citations: finds fabricated or mismatched references and retractions, returns clean BibTeX.
- [Domain Health](https://github.com/arhancanli/domain-health-mcp): Email and domain checks: SPF lookup limits, DKIM keys, DMARC, DNS records, registration expiry.
- [Drug Label](https://github.com/arhancanli/drug-label-mcp): FDA drug label answers with section citations, RxNorm name resolution, recalls and shortages.
- [End of Life](https://github.com/arhancanli/end-of-life-mcp): Is this version still supported? EOL dates, latest patch and upgrade target for 470+ products.
- [Internet Standards](https://github.com/arhancanli/internet-standards-mcp): RFC sections, status, obsoleted-by chains, errata and IANA registries for coding agents.
- [License Check](https://github.com/arhancanli/license-check-mcp): Open source license answers: SPDX ids, copyleft, and whether a dependency's license fits yours.
- [Package Truth](https://github.com/arhancanli/package-truth-mcp): Checks packages exist before install: version, deprecation, vulnerabilities, licence. 7 ecosystems.
- [The whole collection](https://github.com/arhancanli/mcp-factory#servers), 5 more
<!-- family:end -->

## License

MIT, Copyright (c) 2026 Arhan Canli.
