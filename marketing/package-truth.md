# {{title}}: launch kit

Every number below is filled in from the server's measured files when this kit is rendered
(`node scripts/launch-kit.mjs package-truth`). Post only after the release is on npm.

## Positioning

- One line: stop coding agents from installing packages that do not exist, are deprecated, or have
  known vulnerabilities.
- Who it is for: anyone who lets Claude Code, Cursor, Copilot or another agent add dependencies.
- Why now: models invent package names, and attackers register the invented names
  ("slopsquatting"). In a USENIX Security 2025 study of 16 code models, 19.7% of recommended
  packages did not exist.
- Proof: tool definitions of {{tool_chars}} characters per turn against {{competitor_tool_chars}}
  for {{competitor}} ({{tool_saving_pct}} smaller); first calls {{first_call_range}} from
  {{measured_where}}; repeats under {{repeat_max_ms}} ms.

## Show HN

**Title:** Show HN: Package Truth, an MCP server that stops agents installing packages that don't exist

**Text:**

I kept seeing coding agents suggest packages that were never published, or pin versions with
known advisories. A USENIX Security 2025 paper measured it: 19.7% of the packages that 16 code
models recommended did not exist, and people now register those names to catch the installs.

Package Truth is a small MCP server that checks dependencies before they are installed. Give it
package names or a whole manifest (package.json, requirements.txt, pyproject.toml, Cargo.toml,
go.mod, Gemfile, .csproj, pom.xml) and each dependency gets one of four verdicts: does_not_exist,
risky (deprecated or known advisories), verify (very new or tiny, a possible squat) or ok. Ranges
are resolved the way the package manager would resolve them today, so `^5.0.0` is checked at the
5.x version npm would install, not the latest 7.x.

It covers npm, PyPI, Go, Maven, Cargo, NuGet and RubyGems through deps.dev, with no account or key.
The tool list is {{tool_chars}} characters, which matters because clients resend it on every turn.

Install: `{{install}}`, or `{{claude_code_install}}` in Claude Code.

Code (MIT): {{repo}}

I'd like to hear where the verdicts are wrong or unhelpful.

## Reddit: r/mcp

**Title:** Package Truth: check that a dependency exists (and isn't deprecated or vulnerable) before your agent installs it

**Text:** Built this after too many agent suggestions of packages that were never published.
{{tool_count}} tools ({{tool_names}}), seven registries, whole manifests with real range
resolution, verdicts an agent can act on. Tool definitions are {{tool_chars}} characters against
{{competitor_tool_chars}} for {{competitor}}. `{{install}}`. Repo: {{repo}}. Feedback on false
positives especially welcome.

## Reddit: r/ClaudeAI and r/cursor

**Title:** An MCP server that catches hallucinated and deprecated packages before Claude or Cursor installs them

**Text:** Add it with `{{claude_code_install}}` (or the one-click Cursor button in the README) and
tell the agent to check dependencies before installing. It flags names that don't exist, versions
that were never published, deprecated packages, versions with known advisories, and brand-new
packages that could be squats. Free, no key, MIT: {{repo}}

## X / Bluesky thread

1. Coding agents invent package names. A USENIX Security 2025 study: 19.7% of packages recommended
   by 16 models did not exist. Attackers now register those names.
2. I built Package Truth, an MCP server that checks every dependency before install: exists?
   deprecated? known advisories? suspiciously new? Seven registries, whole manifests.
3. Ranges resolve like the real package manager, so the verdict is about the version that would
   actually be installed today.
4. Small on purpose: {{tool_chars}} characters of tool definitions per turn ({{tool_saving_pct}}
   less than {{competitor}}). `{{install}}` {{repo}}

## LinkedIn

AI coding assistants recommend packages that do not exist often enough that attackers now publish
malware under the invented names. I built Package Truth, an open-source MCP server that checks
every dependency an agent wants to add, across npm, PyPI, Go, Maven, Cargo, NuGet and RubyGems,
and tells it plainly: does not exist, risky, verify, or ok. It is free, needs no key, and is
measured against the best alternative before release. {{repo}}

## awesome-mcp-servers entry (Developer Tools)

- [arhancanli/{{package}}]({{repo}}) 📇 🏠 🍎 🪟 🐧 - Checks packages exist before an agent installs them: missing names and versions, deprecation, known advisories, licence and squat risk across npm, PyPI, Go, Maven, Cargo, NuGet and RubyGems; whole manifests with range resolution.

## Directory blurbs

- Short (Smithery, mcp.so, PulseMCP): {{summary}}
- Long (Glama, cursor.directory): {{description}} Whole manifests (package.json, requirements.txt,
  pyproject.toml, Cargo.toml, go.mod, Gemfile, .csproj, pom.xml) with ranges resolved like the
  package manager. Verdicts: does_not_exist, risky, verify, ok. No key.

## Cross-links

Mention the collection in every post footer where it fits: {{collection_size}} servers so far,
each measured before release: {{collection_topic}}. Related: {{related}}.
