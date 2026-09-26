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
   **Measure.** `node scripts/perf.mjs <name>` runs the server's standard scenarios against the
   live upstream: first-call time in a fresh process, repeat time (the server's own overhead),
   result size, and tool-definition size against the competitor's. The README's Performance and
   Example blocks are rendered from that file; a server without it does not pass the gate.
5. **Ship.** Every server has its own repository, `github.com/arhancanli/<package name>`, so each
   one collects its own stars, issues and releases. `servers/<name>` in the factory is byte for byte
   that repository: `npm run sync` vendors the kit and the repository scaffolding (CI, release,
   canary, CodeQL, Scorecard, Dependabot, SECURITY.md) and writes the Claude Desktop bundle
   manifest. `scripts/publish-repos.mjs` pushes the committed tree (never the working tree) as a
   commit signed by the owner and proves parity: the repository's tree id must equal the factory's.
   A tag `vX.Y.Z` in the server's repository publishes npm with provenance, the official MCP
   Registry entry and a Sigstore-signed Claude Desktop bundle. Then Glama, Smithery,
   cursor.directory and awesome-mcp-servers.

## The collection

`catalog.json` is the machine-readable index of every server: category, summary, tools, hosts,
repository and npm links. Every README ends with related servers from the catalog (same category
first) and a link to the whole collection, so each repository sends readers to the others. The
catalog is also the base for what comes after the individual servers: a hub that routes an agent to
the right server by tool search instead of loading every tool list, and compositions that chain
servers (for example, checking every package a paper's code depends on).

## Marketing

Each server has hand-written launch copy in `marketing/<name>.md` (Show HN, Reddit, X, LinkedIn,
directory blurbs, the awesome-mcp-servers entry) whose numbers are placeholders filled from the
measured files by `scripts/launch-kit.mjs`, so no post carries a typed or stale figure. Every
repository carries the shared topic `arhancanli-mcp`, links its related servers and the whole
collection, and the owner's GitHub profile README is rendered from the catalog. The owner posts;
nothing is posted on his behalf.

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
