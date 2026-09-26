# Satellite Imagery: launch kit

Numbers are filled from the server's measured files (`node scripts/launch-kit.mjs satellite-imagery`).
Post only after the release is on npm.

## Positioning

- One line: the clearest satellite image of any place and time, ranked by how much of your area it
  actually covers.
- Who it is for: people working on agriculture, climate, real estate, journalism, disaster
  response and GIS, and anyone building a geospatial agent.
- Why now: satellite catalogues are free and huge, but picking a usable scene still means sifting
  cloudy slivers by hand.
- Proof: coverage-first ranking, four collections (optical, radar, aerial), requester-pays and
  licence called out per scene. Tool definitions of 1,731 characters against
  2,776 for planetary-computer-mcp (run with mcp<2 pinned; its default install fails to start) (38% smaller).

## Show HN

**Title:** Show HN: Satellite Imagery, an MCP server that finds the scene you would have picked by hand

**Text:**

Search a STAC catalogue for a place and you get every scene that touches it, including slivers at a
tile's edge. I built an MCP server that measures how much of your area each scene covers, ranks by
that, then cloud cover, then date, and returns preview, true-colour and band links. It covers
Sentinel-2, Landsat, Sentinel-1 radar and NAIP through Element 84's Earth Search, flags which files
are in requester-pays buckets, and carries each provider's credit line.

No key, MIT: https://github.com/arhancanli/satellite-imagery-mcp. `npx -y satellite-imagery-mcp`

## Reddit: r/gis, r/remotesensing (check each subreddit's rules first)

**Title:** Free tool for AI assistants: find the clearest Sentinel-2/Landsat scene that actually covers your area

**Text:** An MCP server for Claude, Cursor and others: give a place and dates, get scenes ranked by
coverage of your area, then cloud cover, with preview and COG links, band details and licences.
Open source: https://github.com/arhancanli/satellite-imagery-mcp

## Reddit: r/mcp

**Title:** Satellite Imagery: coverage-ranked STAC search in 2 tools

**Text:** `find_imagery`, `scene_assets`. Tool definitions 1,731 characters. `claude mcp add satellite-imagery -- npx -y satellite-imagery-mcp`. https://github.com/arhancanli/satellite-imagery-mcp

## X / Bluesky thread

1. Satellite catalogues return every scene that touches your area, slivers included. Picking one is manual work.
2. I built an MCP server that ranks by how much of your area each scene really covers, then cloud, then date.
3. Sentinel-2, Landsat, Sentinel-1 radar, NAIP. Requester-pays files flagged, credit lines included.
4. Free, MIT: https://github.com/arhancanli/satellite-imagery-mcp

## LinkedIn

Free satellite imagery is abundant; picking the right scene is still tedious. I built Satellite
Imagery, an open-source MCP server that lets an AI assistant find the clearest Sentinel-2, Landsat,
radar or aerial scene for a place and time, ranked by real coverage of the area, with download links
and licences. https://github.com/arhancanli/satellite-imagery-mcp

## awesome-mcp-servers entry (Location Services)

- [arhancanli/satellite-imagery-mcp](https://github.com/arhancanli/satellite-imagery-mcp) 📇 🏠 🍎 🪟 🐧 - Finds Sentinel-2, Landsat, Sentinel-1 and NAIP scenes for a place and period via Earth Search STAC, ranked by real coverage of your area, cloud cover and date, with preview, COG and band links.

## Directory blurbs

- Short: Find the clearest Sentinel-2, Landsat, Sentinel-1 or NAIP scene for any place, with band links.
- Long: Finds the best satellite scenes for a place and time from Earth Search (Sentinel-2, Landsat, Sentinel-1 radar and NAIP), ranked by how much of your area each covers, cloud cover and date, with previews, band download links and licences.

## Cross-links

Footer: 12 servers, each measured before release: https://github.com/topics/arhancanli-mcp. Related: Citation Check (https://github.com/arhancanli/citation-check-mcp), Domain Health (https://github.com/arhancanli/domain-health-mcp), Drug Label (https://github.com/arhancanli/drug-label-mcp).
