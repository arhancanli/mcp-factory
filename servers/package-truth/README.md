# Package Truth

Stops coding agents from installing packages that do not exist, are deprecated, or have known
vulnerabilities, across npm, PyPI, Go, Maven, Cargo, NuGet and RubyGems.

Language models invent package names. In a USENIX Security 2025 study of 16 code models, 19.7% of
the packages they recommended did not exist, and attackers now register those invented names
("slopsquatting"). Package Truth checks every dependency before it is installed and gives each
one a verdict an agent can act on:

| Verdict | Meaning |
| --- | --- |
| `does_not_exist` | No such package, no such version, or no version matching the range: do not install |
| `risky` | The version that would be installed is deprecated or has known advisories |
| `verify` | Published under 90 days ago or has at most two versions: a possible squat, check before use |
| `ok` | No problem found in deps.dev at query time (not a security guarantee) |

Give it a whole manifest (`package.json`, `requirements.txt`, `pyproject.toml`, `Cargo.toml`,
`go.mod`, `Gemfile`, `*.csproj`, `pom.xml`) and it resolves each range to the version an install
would pick today, checks it, and lists problems first. No account, no key.

Built and maintained by [Arhan Canli](https://github.com/arhancanli). Data from
[deps.dev](https://deps.dev) (Open Source Insights).

## Install

Needs Node.js 20 or newer. No account or key is required unless a tool says so.

**Claude Code**

```sh
claude mcp add package-truth -- npx -y package-truth-mcp
```

**Claude Desktop, Cursor, Windsurf and other clients** (add to the client's MCP config file):

```json
{
  "mcpServers": {
    "package-truth": { "command": "npx", "args": ["-y", "package-truth-mcp"] }
  }
}
```

**VS Code**

```sh
code --add-mcp '{"name":"package-truth","command":"npx","args":["-y","package-truth-mcp"]}'
```

**Docker**

```sh
docker build -t package-truth-mcp . && docker run -i --rm package-truth-mcp
```

**Hosted (Streamable HTTP)**: run `node src/server.mjs --http` (port from `PORT`, default 3000);
the endpoint is `POST /mcp`, stateless.

## Tools

<!-- tools:start -->
| Tool | What it does |
| --- | --- |
| `check_manifest` | Checks every dependency in a manifest file's text (package.json, requirements*.txt, pyproject.toml, Cargo.toml, go.mod, Gemfile, *.csproj, pom.xml). Pinned versions are checked exactly; ranges at the version an install would pick today. Problems are listed first. |
| `check_packages` | Checks up to 100 packages in one registry: exists, latest version, deprecated, known advisories, licence, age. Verdict each: does_not_exist, risky, verify (new or tiny: possible squat) or ok. Omit version for the latest. |
| `get_advisories` | Lists the known security advisories for one package version (latest if omitted): id, title, CVE aliases, CVSS 3 score and link, plus how many affect the latest version. |
<!-- tools:end -->

## How it behaves

- Read-only: no tool changes anything outside this process. Manifests are parsed as text; nothing
  in them is executed or fetched.
- Ranges are resolved like the package manager would (npm and Cargo caret, tilde, x and hyphen
  ranges; PyPI specifiers including `~=` and `==1.2.*`; RubyGems `~>`). Prereleases are never
  picked. Maven and NuGet ranges are checked at the latest version and flagged as such.
- Network: HTTPS only, to the hosts listed in `package.json` under `factory.allowHosts`, with a
  deadline, a size cap and bounded retries. Nothing else is contacted, and nothing is logged
  except unexpected failures (to stderr, without your inputs).
- Results are compact JSON with a matching output schema. Lists say how many items were left out.

## Benchmark

<!-- bench:start -->
Not yet measured.
<!-- bench:end -->

## License

MIT, Copyright (c) 2026 Arhan Canli.
