# MCP Factory: specification

Owner: Arhan Canli. Started 2026-09-26.

## Goal

Produce MCP servers, across every niche, that are the best available in their niche and that
people choose, star and recommend. Being best is decided by measurement against the best existing
server, never by our own description.

## The production line

Every server moves through five stations. A server that fails a station goes back; it never skips.

1. **Scout.** An evidence sheet in `docs/scout/`: demand (issues asking for it, downloads and stars
   of existing servers, directory listings), the best incumbent and its measured weaknesses, the
   data source (cost, licence, rate limits, keyless or not) and how we would clearly win. A niche
   with a strong official server is rejected unless we can name a measured weakness it has.
2. **Build.** `npm run new -- <name>` creates `servers/<name>` from `templates/server`. The shared
   kit (`kit/`) is copied in, not imported, so every server installs with only the MCP SDK and zod,
   and a drift test fails if a server's copy differs from the canonical kit.
3. **Gate.** The factory test suite (`gate/`) runs against every server. All of it must pass:
   - Tool list: every tool has a title, a description of at most 400 characters, annotations
     (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`) and an output schema;
     every string input has a maximum length and every array a maximum size; the whole
     model-visible tool list stays inside the server's declared budget (default 6,000 characters)
     and is byte-identical across two launches, so providers can cache it.
   - Results: compact JSON with structured content; long lists are truncated with an explicit
     count of what was left out, never silently.
   - Network: HTTPS only, hosts restricted to the server's declared allowlist, no redirects to
     other hosts, a response-size cap, a deadline, retries only for idempotent reads (429/5xx,
     honouring Retry-After). Upstream bodies and keys never appear in error messages or logs.
   - Correctness: golden tests on recorded upstream responses, plus a scheduled live canary job
     that calls the real API so upstream drift is caught within a week.
   - Wiring: the packed npm tarball installs from its lockfile and answers `initialize` and
     `tools/list` over real stdio.
   - Hygiene: registry files agree on name and version; README tool table is generated from the
     code (numbers are derived, never typed); no em dashes; the credit guard passes.
4. **Benchmark.** A fixed task set per server, run by an agent against our server and the best
   competitor: right tool chosen, right answer, tokens used, latency. Results are published in the
   server's README with the date and models. A server ships only if it beats or matches the
   competitor on accuracy and uses fewer tokens, or covers tasks the competitor cannot do.
5. **Ship.** npm with provenance from CI, official MCP Registry, a signed Claude Desktop bundle per
   release, Docker image, Glama, Smithery, cursor.directory and awesome-mcp-servers. OpenSSF
   Scorecard, CodeQL and Dependabot on from the first commit.

## After shipping

Weekly: npm downloads, stars, directory listings, open issues and canary status per server,
recorded in `docs/METRICS.md`. An issue opened by a user gets a reply within a day. Any claim in a
README is re-measured when the code it describes changes.

## Credit

Arhan Canli is the only author and contributor. Every commit is made and signed under his identity.
No file, commit message, PR or release names an AI assistant as author or co-author; the credit
guard (`gate/credit.test.mjs`) and the commit-msg hook enforce this.

## Brand

`factory.config.json` holds the brand, npm scope and GitHub owner. Changing the brand is one edit
there, and must happen before a server's first publish, because published names are permanent.

## What only the owner can do

Log in to directories (Smithery and similar), approve paid APIs, merge pull requests, and post
launches.
