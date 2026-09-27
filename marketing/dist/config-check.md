# Config Check: launch kit

Numbers are filled from the server's measured files (`node scripts/launch-kit.mjs config-check`).
Post only after the release is on npm.

## Positioning

- One line: validates config files against their official schemas and says, per error, the line,
  the allowed values and the key that was meant.
- Who it is for: developers whose agents write tsconfig.json, GitHub workflows, Compose files,
  pyproject.toml, ESLint, Renovate and Dependabot configs, and platform teams reviewing them.
- Why now: agents write config from memory, and config fails late (GitHub rejects the workflow
  after the push) or silently (tsconfig ignores keys it does not know). SchemaStore already has
  the official schemas; agents have had no way to use them.
- Proof: 1,400+ kinds of config chosen by file name, JSON/JSONC/YAML/TOML with line numbers, one
  error per mistake instead of one per anyOf branch, warnings for the misspellings schemas let
  through. Tool definitions of 2,029 characters.

## Show HN

**Title:** Show HN: Config Check, an MCP server that validates config files against SchemaStore

**Text:**

Agents write config files constantly and get the keys slightly wrong: runs_on for runs-on,
strictNullCheck for strictNullChecks, condition: service_ready where Compose only accepts
service_started, service_healthy or service_completed_successfully. The workflow fails after the
push; the tsconfig typo never fails at all, because tsconfig ignores unknown options.

SchemaStore has the official JSON Schema for 1,400+ kinds of config file, matched by file name;
it is what VS Code and JetBrains use to underline these mistakes. I built an MCP server that runs
those schemas for an agent: JSON, JSONC, YAML and TOML, every error with its line, a readable path,
the allowed values and the key probably meant. Two things took most of the work: turning Ajv's
anyOf noise (four errors for one bad tsconfig target) into the one error for the alternative the
value nearly matched, and warning about the mistakes schemas let through, like misspelt keys in
objects that accept anything and values that only pass because another alternative matched.

It also answers "what does this setting do and what values does it take" from the same schemas.

MIT: https://github.com/arhancanli/config-check-mcp. `npx -y config-check-mcp`

## Reddit: r/devops, r/typescript (check each subreddit's rules first)

**Title:** Free tool so AI agents stop shipping broken config: SchemaStore validation with line numbers

**Text:** tsconfig, GitHub workflows, Compose, pyproject.toml, Dependabot, Renovate and 1,400+ more.
Each error gets the line, the allowed values and the key probably meant. Works in Claude Code,
Cursor and other MCP clients. https://github.com/arhancanli/config-check-mcp

## Reddit: r/mcp

**Title:** Config Check: validate any config file against its official schema in 3 tools

**Text:** `config_help`, `find_schema`, `validate_config`. Tool definitions 2,029 characters. `claude mcp add config-check -- npx -y config-check-mcp`. https://github.com/arhancanli/config-check-mcp

## X / Bluesky thread

1. "strictNullCheck": true in tsconfig does nothing. No error, no warning, no null checks.
2. I built an MCP server that validates config against SchemaStore's official schemas, the ones your editor uses, and gives the agent the line and the key it meant.
3. tsconfig, GitHub workflows, Compose, pyproject.toml, Dependabot and 1,400+ more. JSON, YAML, TOML.
4. Free, MIT: https://github.com/arhancanli/config-check-mcp

## LinkedIn

Configuration mistakes are cheap to make and expensive to find: a workflow GitHub rejects after
the push, a Compose file that fails on the server, a compiler option that is silently ignored. I
built Config Check, an open-source MCP server that validates config files against their official
schemas from SchemaStore, so AI agents fix the key before anyone runs it. https://github.com/arhancanli/config-check-mcp

## awesome-mcp-servers entry (Developer Tools)

- [arhancanli/config-check-mcp](https://github.com/arhancanli/config-check-mcp) 📇 ☁️ 🍎 🪟 🐧 - Validates config files (JSON, JSONC, YAML, TOML) against SchemaStore's official schemas for 1,400+ file types: errors with line, allowed values and the key probably meant, warnings for misspelt and deprecated settings, and setting lookup.

## Directory blurbs

- Short: Validates config files against their official schemas: tsconfig, compose, workflows, 1,400+ more.
- Long: Validates configuration files (JSON, JSON with comments, YAML, TOML) against the schema for their file name from SchemaStore: tsconfig.json, package.json, docker-compose.yml, GitHub workflows, ESLint, Renovate and 1,400+ more. Every error has its line and path, the allowed values, and the property you probably meant for a misspelled key; and any setting can be looked up with its description and allowed values. No key.

## Cross-links

Footer: 17 servers, each measured before release: https://github.com/topics/arhancanli-mcp. Related: Actions Check (https://github.com/arhancanli/actions-check-mcp), Citation Check (https://github.com/arhancanli/citation-check-mcp), Contact Check (https://github.com/arhancanli/contact-check-mcp).
