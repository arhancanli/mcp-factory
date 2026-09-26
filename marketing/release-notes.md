# {{title}}: launch kit

Numbers are filled from the server's measured files (`node scripts/launch-kit.mjs release-notes`).
Post only after the release is on npm.

## Positioning

- One line: tells coding agents what breaks in an upgrade, from the package's own changelog.
- Who it is for: developers letting agents bump dependencies (Dependabot and Renovate reviewers,
  migration work), maintainers answering "what changed since X?".
- Why now: agents upgrade dependencies constantly and answer "is this safe?" from memory. The
  changelog knows, but it is thousands of lines in one of a dozen formats, split across pre-releases,
  files and GitHub releases.
- Proof: breaking changes, removals, deprecations, security fixes and raised requirements between
  two versions, each tagged with its version; the release where an API changed, with the section it
  was listed under. Tool definitions of {{tool_chars}} characters.

## Show HN

**Title:** Show HN: Release Notes, an MCP server that tells agents what breaks in an upgrade

**Text:**

When a coding agent upgrades a dependency, it decides whether the upgrade is safe from what it
remembers about the library. I built an MCP server that reads the package's own changelog instead:
give it a package and two versions, and it lists the breaking changes, removals, deprecations,
security fixes and raised runtime requirements in between, each tagged with the version that
introduced it. Pre-release notes count, because that is where most breaking changes are written
down (express removed req.param() in 5.0.0-alpha.2).

It finds the changelog in the package's directory of a monorepo or at the root, parses Markdown,
underlined and reStructuredText formats, and falls back to GitHub releases when there is no file,
or when the file covers only the newest major. npm, PyPI, crates.io, Go, Maven and NuGet.

No key, MIT: {{repo}}. `{{install}}`

## Reddit: r/node, r/Python, r/rust (check each subreddit's rules first)

**Title:** Free tool so AI agents check the changelog before upgrading your dependencies

**Text:** Give it a package and two versions; it lists breaking changes, removals, deprecations,
security fixes and requirement bumps in between, each with its version. Works in Claude Code,
Cursor and other MCP clients. {{repo}}

## Reddit: r/mcp

**Title:** Release Notes: upgrade impact from changelogs in {{tool_count}} tools

**Text:** {{tool_names}}. Tool definitions {{tool_chars}} characters. `{{claude_code_install}}`. {{repo}}

## X / Bluesky thread

1. Your agent just bumped express from 4 to 5. Did it read the changelog? It read its memory.
2. I built an MCP server that reads the package's own changelog: breaking changes, removals, deprecations, security fixes between two versions.
3. It counts pre-release notes (where breaking changes live) and falls back to GitHub releases. npm, PyPI, crates.io, Go, Maven, NuGet.
4. Free, MIT: {{repo}}

## LinkedIn

Dependency upgrades are one of the most common jobs we hand to AI coding agents, and the agents
judge them from memory. I built Release Notes, an open-source MCP server that reads a package's own
changelog and tells the agent exactly what breaks, what was removed or deprecated, which security
fixes it gains and which runtime versions it drops, between any two versions. {{repo}}

## awesome-mcp-servers entry (Developer Tools)

- [arhancanli/{{package}}]({{repo}}) 📇 ☁️ 🍎 🪟 🐧 - Upgrade impact from a package's own changelog or GitHub releases: breaking changes, removals, deprecations, security fixes and requirement bumps between two versions; when an API changed. npm, PyPI, crates.io, Go, Maven, NuGet.

## Directory blurbs

- Short: {{summary}}
- Long: {{description}}

## Cross-links

Footer: {{collection_size}} servers, each measured before release: {{collection_topic}}. Related: {{related}}.
