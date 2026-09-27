# Config Check

<!-- badges:start -->
[![CI](https://github.com/arhancanli/config-check-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/arhancanli/config-check-mcp/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/config-check-mcp)](https://www.npmjs.com/package/config-check-mcp)
[![downloads](https://img.shields.io/npm/dw/config-check-mcp)](https://www.npmjs.com/package/config-check-mcp)
[![OpenSSF Scorecard](https://api.securityscorecards.dev/projects/github.com/arhancanli/config-check-mcp/badge)](https://scorecard.dev/viewer/?uri=github.com/arhancanli/config-check-mcp)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
<!-- badges:end -->

Agents write config files all day and misspell them: `runs_on` for `runs-on`, `strictNullCheck`
for `strictNullChecks`, `service_ready` where Compose only knows `service_started`,
`service_healthy` and `service_completed_successfully`. Most of these fail late (a workflow GitHub
rejects after the push) or never (tsconfig ignores keys it does not know). Config Check validates
config files against the official JSON Schema for their file name from
[SchemaStore](https://www.schemastore.org), the catalog VS Code and JetBrains IDEs use, and reports
what an editor would underline in a form a model can act on:

- **Validate** up to 20 files at once: JSON, JSON with comments, YAML (every document, merge keys)
  and TOML. The schema is chosen by file name (1,400+ kinds), by the file's own `$schema`, or by
  name. Each error has its line, a readable path (`jobs.test.steps[1].timeout`), the allowed values
  and the key probably meant; a value that fails an `anyOf` gets one error for the alternative it
  nearly matched, not one per alternative.
- **Warnings** for what schemas let through: misspelt keys in settings that accept unknown keys
  (tsconfig's `compilerOptions`), deprecated settings, and values that break their own setting's
  definition while another alternative lets the file pass (tsconfig's `"include": "src"`).
- **Look up** any setting: its description, type, allowed values, default, deprecation and
  sub-settings, or search a schema's settings by words.

No key needed.

Built and maintained by [Arhan Canli](https://github.com/arhancanli).

## Install

<!-- install:start -->
[![Install in Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=config-check&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsImNvbmZpZy1jaGVjay1tY3AiXX0%3D)
[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install_Server-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=config-check&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22config-check-mcp%22%5D%7D)
[![Install in Goose](https://block.github.io/goose/img/extension-install-dark.svg)](https://block.github.io/goose/extension?cmd=npx&arg=-y&arg=config-check-mcp&id=config-check&name=Config%20Check&description=Validates%20configuration%20files%20(JSON%2C%20JSON%20with%20comments%2C%20YAML%2C%20TOML)%20against%20the%20schema%20for%20their%20file%20name%20from%20SchemaStore%3A%20tsconfig.json%2C%20package.json%2C%20docker-compose.yml%2C%20GitHub%20workflows%2C%20ESLint%2C%20Renovate%20and%201%2C400%2B%20more.%20Every%20error%20has%20its%20line%20and%20path%2C%20the%20allowed%20values%2C%20and%20the%20property%20you%20probably%20meant%20for%20a%20misspelled%20key%3B%20and%20any%20setting%20can%20be%20looked%20up%20with%20its%20description%20and%20allowed%20values.%20No%20key.)

Needs Node.js 20 or newer. No account or key.

**Claude Code**

```sh
claude mcp add config-check -- npx -y config-check-mcp
```

**Claude Desktop**: download `config-check-mcp-<version>.mcpb` from the [latest release](https://github.com/arhancanli/config-check-mcp/releases/latest) and open it. The bundle is signed; verify it with `gh attestation verify <file> --repo arhancanli/config-check-mcp`.

**Any other client** (Windsurf, Zed, Cline, Continue and others), in its MCP config file:

```json
{
  "mcpServers": {
    "config-check": {
      "command": "npx",
      "args": [
        "-y",
        "config-check-mcp"
      ]
    }
  }
}
```

**Docker**

```sh
docker build -t config-check-mcp https://github.com/arhancanli/config-check-mcp.git && docker run -i --rm config-check-mcp
```

**Hosted (Streamable HTTP)**: `node src/server.mjs --http` serves stateless MCP at `POST /mcp` (port from `PORT`, default 3000).
<!-- install:end -->

## Example

<!-- example:start -->
An agent calls `validate_config` with:

```json
{
  "files": [
    {
      "path": "tsconfig.json",
      "content": "{\n  // JSON with comments, as tsconfig allows\n  \"compilerOptions\": {\n    \"target\": \"es2099\",\n    \"moduleResolution\": \"nodenext\",\n    \"strictNullCheck\": true,\n    \"outdir\": \"dist\",\n    \"importsNotUsedAsValues\": \"remove\",\n  },\n  \"include\": \"src\"\n}\n"
    },
    {
      "path": ".github/workflows/ci.yml",
      "content": "name: CI\non:\n  push:\n    branch: [main]\n  pull_request:\njobs:\n  test:\n    runs_on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: npm test\n        timeout: 10\n  build:\n    runs-on: ubuntu-latest\n    needs: test\n    steps:\n      - name: Build\n"
    },
    {
      "path": "docker-compose.yml",
      "content": "services:\n  web:\n    image: nginx:latest\n    port:\n      - \"80:80\"\n    depends_on:\n      - db\n    healthcheck:\n      test: [\"CMD\", \"curl\", \"-f\", \"http://localhost\"]\n      interval: 30\n  db:\n    image: postgres:16\n"
    },
    {
      "path": "pyproject.toml",
      "content": "[build-system]\nbuild-backend = \"hatchling.build\"\n\n[project]\nname = \"demo\"\nversion = \"0.1.0\"\nrequires-python = 3.11\ndependencies = \"requests>=2\"\n\n[tool.ruff]\nline_length = 100\n"
    }
  ]
}
```

and gets back (recorded from the live server on 2026-09-27):

```json
{
  "valid": 0,
  "invalid": 4,
  "files": [
    {
      "path": "tsconfig.json",
      "schema": "tsconfig.json",
      "schema_url": "https://www.schemastore.org/tsconfig.json",
      "valid": false,
      "warnings": [
        {
          "line": 6,
          "path": "compilerOptions.strictNullCheck",
          "message": "\"strictNullCheck\" is not a setting the schema knows; did you mean \"strictNullChecks\"?",
          "did_you_mean": "strictNullChecks"
        },
        {
          "line": 7,
          "path": "compilerOptions.outdir",
          "message": "\"outdir\" is not a setting the schema knows; did you mean \"outDir\"?",
          "did_you_mean": "outDir"
        },
        {
          "line": 8,
          "path": "compilerOptions.importsNotUsedAsValues",
          "message": "deprecated: Deprecated in favor of verbatimModuleSyntax."
        },
        {
          "line": 10,
          "path": "include",
          "message": "must be array or null, not string (the schema's alternatives let the file pass, but this setting's own definition does not)"
        }
      ],
      "errors": [
        {
          "line": 4,
          "path": "compilerOptions.target",
          "message": "\"es2099\" is not an allowed value",
          "allowed": [
            "es3",
            "es5",
            "es6",
            "es2015",
            "es2016",
            "es2017",
            "es2018",
            "es2019",
            "es2020",
            "es2021",
            "es2022",
            "es2023",
            "es2024",
            "es2025",
            "esnext"
          ]
        }
      ]
    },
    {
      "path": ".github/workflows/ci.yml",
... (82 more lines)
```
<!-- example:end -->

## Tools

<!-- tools:start -->
| Tool | What it does |
| --- | --- |
| `config_help` | What a setting in a config file means and accepts, from its official schema: description, type, allowed values, default, deprecation and its sub-settings. setting is a dotted path (compilerOptions.module, jobs.*.runs-on, services.*.healthcheck); omit it for the top level. search finds settings by words instead (search: 'healthcheck interval'). |
| `find_schema` | Which SchemaStore schema applies to a file (give its path or name) or matches words (kubernetes, eslint flat config): name, URL and the file names it covers, best match first. Use the name or URL as validate_config's or config_help's schema. |
| `validate_config` | Checks config files against their official JSON Schema from SchemaStore (1,400+ kinds, chosen by file name: tsconfig.json, package.json, docker-compose.yml, .github/workflows/*.yml, pyproject.toml...). JSON, JSONC, YAML, TOML. Each error has its line, path, the allowed values and the key probably meant; also warns on likely misspelt and deprecated settings. |
<!-- tools:end -->

## How it behaves

- Read-only: no tool changes anything outside this process. File contents never leave it; only
  schemas are downloaded.
- Network: HTTPS only. SchemaStore's catalog comes from `www.schemastore.org` (cached for a day);
  each schema, and every document it references, is fetched only from the hosts that catalog lists,
  level by level in parallel, with a deadline, an 8 MB cap per document and bounded retries. A
  schema the file names for itself (`$schema`, `# yaml-language-server: $schema=`, Taplo's
  `#:schema`) is used when it is on one of those hosts. Nothing is logged except unexpected
  failures (to stderr, without your inputs).
- Validation is [Ajv](https://ajv.js.org), the validator SchemaStore tests its own schemas with,
  with [ajv-formats](https://github.com/ajv-validator/ajv-formats). SchemaStore mixes drafts 04 to
  2020-12 and schemas of one draft reference schemas of another, so each document is normalised
  (draft-04's boolean `exclusiveMaximum`, 2020-12's `prefixItems`) and compiled together, once per
  schema, cached for 6 hours.
- YAML is read as YAML 1.2, as GitHub and Compose read it (`yes` is text, `on:` is a key), with
  merge keys. TOML dates are compared as their text.
- Results are compact JSON with a matching output schema. At most 40 errors and 20 warnings per
  file are listed; the rest are counted.

## Benchmark

<!-- bench:start -->
Not yet measured.
<!-- bench:end -->

## Performance

<!-- perf:start -->
Measured 2026-09-27 from Dubai, home connection against the live upstream, Node 24.19.0 (`bench/perf.json`, `scripts/perf.mjs` in the factory).

| Call | First call | Repeat | Result size |
| --- | --- | --- | --- |
| validate_config: tsconfig, a workflow, a compose file and pyproject.toml with typical mistakes | 1705 ms | 8.2 ms | 2,846 chars |
| validate_config: a clean workflow, and a manifest.json three schemas claim | 976 ms | 1.9 ms | 560 chars |
| validate_config: YAML that does not parse | 6 ms | 0.5 ms | 169 chars |
| config_help: tsconfig's compilerOptions.moduleResolution | 374 ms | 1.9 ms | 1,056 chars |
| config_help: search a workflow's settings for 'timeout' | 344 ms | 2.7 ms | 372 chars |
| find_schema: a file path and words | 229 ms | 1.6 ms | 313 chars |

First call: a fresh server process, including the TLS connection and the upstream's own time. Repeat: the same call again, answered from the in-process cache, so it shows this server's own overhead.

Tool definitions the model reads on every turn (name, description, input schema): 2,029 characters, against 1,105 for mcp-server-fetch reading SchemaStore (no config-validation MCP server exists; this is what agents use today). The full tool list, with the output schemas and annotations clients use to validate results, is 3,283 characters (1,104 for the alternative).
<!-- perf:end -->

## More MCP servers by Arhan Canli

<!-- family:start -->
- [Actions Check](https://github.com/arhancanli/actions-check-mcp): Checks GitHub Actions workflows: outdated actions, old Node runtimes, retired runners, injection.
- [Cron Check](https://github.com/arhancanli/cron-check-mcp): Explains cron expressions, lists next run times in any time zone, converts between cron dialects.
- [Domain Health](https://github.com/arhancanli/domain-health-mcp): Email and domain checks: SPF lookup limits, DKIM keys, DMARC, DNS records, registration expiry.
- [End of Life](https://github.com/arhancanli/end-of-life-mcp): Is this version still supported? EOL dates, latest patch and upgrade target for 470+ products.
- [Internet Standards](https://github.com/arhancanli/internet-standards-mcp): RFC sections, status, obsoleted-by chains, errata and IANA registries for coding agents.
- [License Check](https://github.com/arhancanli/license-check-mcp): Open source license answers: SPDX ids, copyleft, and whether a dependency's license fits yours.
- [Package Truth](https://github.com/arhancanli/package-truth-mcp): Checks packages exist before install: version, deprecation, vulnerabilities, licence. 7 ecosystems.
- [Release Notes](https://github.com/arhancanli/release-notes-mcp): What changed between two versions of a package: breaking changes, deprecations, security fixes.
- [The whole collection](https://github.com/arhancanli/mcp-factory#servers), 8 more
<!-- family:end -->

## License

MIT, Copyright (c) 2026 Arhan Canli.
