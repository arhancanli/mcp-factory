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
| [Package Truth](https://github.com/arhancanli/package-truth-mcp) | Checks packages exist before install: version, deprecation, vulnerabilities, licence. 7 ecosystems. | `npx -y package-truth-mcp` |

### Science and research

| Server | What it does | Run |
| --- | --- | --- |
| [Citation Check](https://github.com/arhancanli/citation-check-mcp) | Verifies citations: finds fabricated or mismatched references and retractions, returns clean BibTeX. | `npx -y citation-check-mcp` |
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
