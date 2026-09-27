# Actions Check

<!-- badges:start -->
[![CI](https://github.com/arhancanli/actions-check-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/arhancanli/actions-check-mcp/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/actions-check-mcp)](https://www.npmjs.com/package/actions-check-mcp)
[![downloads](https://img.shields.io/npm/dw/actions-check-mcp)](https://www.npmjs.com/package/actions-check-mcp)
[![OpenSSF Scorecard](https://api.securityscorecards.dev/projects/github.com/arhancanli/actions-check-mcp/badge)](https://scorecard.dev/viewer/?uri=github.com/arhancanli/actions-check-mcp)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
<!-- badges:end -->

Coding agents write GitHub Actions workflows from memory, so they reach for `actions/checkout@v3`,
`echo "::set-output ..."` and `runs-on: ubuntu-20.04` years after those stopped being current, and
they paste untrusted pull request titles into shell scripts. Actions Check reviews workflow files the
way a careful maintainer would, and says what to change:

- **Every action** against its latest release, from the action's own git tags (no API limit): how far
  behind it is, the runtime it runs on (Node 16 actions are deprecated), and the exact line to pin it
  by commit SHA (`actions/checkout@<sha> # v7.0.1`). A moving tag like `@v3` names the release it
  actually points at.
- **Runners** against GitHub's runner-images list, matrix values included: labels GitHub no longer
  provides (jobs wait and fail) and deprecated ones.
- **Security**: untrusted event text (issue and pull request titles, bodies, branch names) expanded
  into `run:` scripts, `pull_request_target` workflows that check out the pull request's code,
  third-party actions not pinned to a commit, missing `permissions`.
- **Deprecated commands**: `set-output`, `save-state`, `set-env`, `add-path`.

Every finding has the file, the line and a fix. No key needed.

Built and maintained by [Arhan Canli](https://github.com/arhancanli).

## Install

<!-- install:start -->
[![Install in Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=actions-check&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsImFjdGlvbnMtY2hlY2stbWNwIl19)
[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install_Server-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=actions-check&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22actions-check-mcp%22%5D%7D)
[![Install in Goose](https://block.github.io/goose/img/extension-install-dark.svg)](https://block.github.io/goose/extension?cmd=npx&arg=-y&arg=actions-check-mcp&id=actions-check&name=Actions%20Check&description=Checks%20GitHub%20Actions%20workflows%20the%20way%20a%20reviewer%20would%3A%20every%20action's%20version%20against%20its%20latest%20release%2C%20the%20commit%20SHA%20to%20pin%20it%20to%2C%20actions%20still%20running%20on%20deprecated%20Node%20runtimes%2C%20runner%20labels%20GitHub%20no%20longer%20provides%2C%20deprecated%20workflow%20commands%2C%20and%20script%20injection%20or%20pull_request_target%20risks%2C%20with%20the%20line%20and%20a%20fix%20for%20each.%20No%20key.)

Needs Node.js 20 or newer. No account or key.

**Claude Code**

```sh
claude mcp add actions-check -- npx -y actions-check-mcp
```

**Claude Desktop**: download `actions-check-mcp-<version>.mcpb` from the [latest release](https://github.com/arhancanli/actions-check-mcp/releases/latest) and open it. The bundle is signed; verify it with `gh attestation verify <file> --repo arhancanli/actions-check-mcp`.

**Any other client** (Windsurf, Zed, Cline, Continue and others), in its MCP config file:

```json
{
  "mcpServers": {
    "actions-check": {
      "command": "npx",
      "args": [
        "-y",
        "actions-check-mcp"
      ]
    }
  }
}
```

**Docker**

```sh
docker build -t actions-check-mcp https://github.com/arhancanli/actions-check-mcp.git && docker run -i --rm actions-check-mcp
```

**Hosted (Streamable HTTP)**: `node src/server.mjs --http` serves stateless MCP at `POST /mcp` (port from `PORT`, default 3000).
<!-- install:end -->

## Example

<!-- example:start -->
An agent calls `check_workflows` with:

```json
{
  "files": [
    {
      "path": ".github/workflows/ci.yml",
      "content": "name: CI\non:\n  pull_request_target:\n  push:\njobs:\n  build:\n    runs-on: ${{ matrix.os }}\n    strategy:\n      matrix:\n        os: [ubuntu-20.04, ubuntu-latest, macos-14]\n    steps:\n      - uses: actions/checkout@v3\n        with:\n          ref: ${{ github.event.pull_request.head.sha }}\n      - uses: actions/setup-node@v4.0.0\n      - uses: peaceiris/actions-gh-pages@v3\n      - uses: some-org/does-not-exist-xyz@v1\n      - run: echo \"Title: ${{ github.event.pull_request.title }}\"\n      - run: |\n          echo \"::set-output name=x::1\"\n          echo \"done\"\n"
    }
  ]
}
```

and gets back (recorded from the live server on 2026-09-26):

```json
{
  "actions": [
    "actions/checkout@v3 -> v3.7.0, latest v7.0.1, node16",
    "actions/setup-node@v4.0.0 -> v4.0.0, latest v7.0.0, node20",
    "peaceiris/actions-gh-pages@v3 -> v3.9.3, latest v4.1.0, node16"
  ],
  "counts": {
    "error": 6,
    "warning": 4,
    "info": 2
  },
  "findings": [
    {
      "level": "error",
      "file": ".github/workflows/ci.yml",
      "line": 18,
      "code": "- run: echo \"Title: ${{ github.event.pull_request.title }}\"",
      "issue": "Script injection: ${{ github.event.pull_request.title }} is text an outside contributor controls, expanded into a shell script.",
      "fix": "Pass it through an environment variable: env: VALUE: ${{ github.event.pull_request.title }} and use \"$VALUE\" in the script."
    },
    {
      "level": "error",
      "file": ".github/workflows/ci.yml",
      "line": 14,
      "code": "ref: ${{ github.event.pull_request.head.sha }}",
      "issue": "pull_request_target workflow checks out the pull request's code: it runs untrusted code with the repository's secrets and a write token.",
      "fix": "Use pull_request for building contributed code, or keep the checkout of the base branch and never run the PR's code in this workflow."
    },
    {
      "level": "error",
      "where": ".github/workflows/ci.yml:12",
      "issue": "actions/checkout@v3 runs on Node 16, which GitHub has deprecated for actions.",
      "fix": "Update to v7.0.1 (runs on Node 24): actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1"
    },
    {
      "level": "error",
      "where": ".github/workflows/ci.yml:16",
      "issue": "peaceiris/actions-gh-pages@v3 runs on Node 16, which GitHub has deprecated for actions.",
      "fix": "Update to v4.1.0 (runs on Node 24): peaceiris/actions-gh-pages@84c30a85c19949d7eee79c4ff27748b70285e453 # v4.1.0"
    },
    {
      "level": "error",
      "where": ".github/workflows/ci.yml:17",
      "issue": "some-org/does-not-exist-xyz@v1: github.com/some-org/does-not-exist-xyz does not exist or is private."
    },
    {
      "level": "error",
      "file": ".github/workflows/ci.yml",
      "line": 7,
      "issue": "runs-on ubuntu-20.04 (matrix.os): GitHub no longer provides this runner; jobs wait and fail.",
      "fix": "Use ubuntu-latest, or a current version from GitHub's runner-images list."
    },
    {
      "level": "warning",
      "file": ".github/workflows/ci.yml",
      "line": 20,
      "code": "echo \"::set-output name=x::1\"",
      "issue": "Deprecated workflow command ::set-output.",
      "fix": "write to $GITHUB_OUTPUT instead: echo \"name=value\" >> \"$GITHUB_OUTPUT\""
    },
... (32 more lines)
```
<!-- example:end -->

## Tools

<!-- tools:start -->
| Tool | What it does |
| --- | --- |
| `action_versions` | For up to 20 actions (owner/repo, or owner/repo@ref): latest release with its commit SHA and runtime, the newest release of each major version, and for a ref, the commit it points to and its runtime, with the line to pin (action@sha # tag). |
| `check_workflows` | Reviews up to 30 workflow files (path and content): outdated actions and the SHA to pin, actions on deprecated Node runtimes, runner labels GitHub no longer provides, deprecated commands (set-output), script injection and pull_request_target risks. Findings with file, line and fix. |
| `runner_labels` | Status of GitHub-hosted runner labels (ubuntu-22.04, macos-14, windows-2019...) from GitHub's runner-images list: available, beta, deprecated, or retired (no longer provided). Without labels, every label GitHub lists now. |
<!-- tools:end -->

## How it behaves

- Read-only: no tool changes anything outside this process.
- Network: HTTPS only, to the hosts listed in `package.json` under `factory.allowHosts`, with a
  deadline, a size cap and bounded retries. Nothing else is contacted, and nothing is logged
  except unexpected failures (to stderr, without your inputs).
- Workflow files are read as text and never run. Tags come from git's own ref listing
  (`github.com/<action>.git/info/refs`), runtimes from each action's `action.yml` at the commit
  used, runner labels from `actions/runner-images`. Answers are cached for 30 minutes.
- Local actions (`./...`) and `docker://` images are not looked up.
- Results are compact JSON with a matching output schema, errors first.

## Benchmark

<!-- bench:start -->
Measured 2026-09-26 with gpt-5.4-mini, 9 fixed tasks graded by fixed checks (`bench/tasks.json`, raw results in `bench/results/`).

| Server | Correct | Input tokens | Output tokens | Tool calls | Median time |
| --- | --- | --- | --- | --- | --- |
| This server | 8/9 | 12672 | 677 | 9 | 2.1 s |
| mcp-server-fetch reading GitHub (no workflow-checking server exists; this is what agents use today) | 6/9 | 109430 | 898 | 21 | 4.2 s |
<!-- bench:end -->

## Performance

<!-- perf:start -->
Measured 2026-09-26 from Dubai, home connection against the live upstream, Node 24.19.0 (`bench/perf.json`, `scripts/perf.mjs` in the factory).

| Call | First call | Repeat | Result size |
| --- | --- | --- | --- |
| check_workflows: a workflow with 12 problems | 1028 ms | 1.1 ms | 3,383 chars |
| check_workflows: a clean, pinned workflow | 648 ms | 0.6 ms | 117 chars |
| action_versions: 3 actions, with and without refs | 1018 ms | 0.9 ms | 1,375 chars |
| runner_labels: 4 labels | 251 ms | 0.3 ms | 293 chars |

First call: a fresh server process, including the TLS connection and the upstream's own time. Repeat: the same call again, answered from the in-process cache, so it shows this server's own overhead.

Tool definitions the model reads on every turn (name, description, input schema): 1,450 characters, against 1,105 for mcp-server-fetch reading GitHub (no workflow-checking server exists; this is what agents use today). The full tool list, with the output schemas and annotations clients use to validate results, is 2,689 characters (1,104 for the alternative).
<!-- perf:end -->

## More MCP servers by Arhan Canli

<!-- family:start -->
- [Config Check](https://github.com/arhancanli/config-check-mcp): Validates config files against their official schemas: tsconfig, compose, workflows, 1,400+ more.
- [Cron Check](https://github.com/arhancanli/cron-check-mcp): Explains cron expressions, lists next run times in any time zone, converts between cron dialects.
- [Dockerfile Check](https://github.com/arhancanli/dockerfile-check-mcp): Checks Dockerfiles: build-breaking mistakes, base image tags that exist, digests, platforms, EOL.
- [Domain Health](https://github.com/arhancanli/domain-health-mcp): Email and domain checks: SPF lookup limits, DKIM keys, DMARC, DNS records, registration expiry.
- [End of Life](https://github.com/arhancanli/end-of-life-mcp): Is this version still supported? EOL dates, latest patch and upgrade target for 470+ products.
- [Internet Standards](https://github.com/arhancanli/internet-standards-mcp): RFC sections, status, obsoleted-by chains, errata and IANA registries for coding agents.
- [Kube Check](https://github.com/arhancanli/kube-check-mcp): Checks Kubernetes manifests for your version: removed APIs, unknown fields, Pod Security, risks.
- [License Check](https://github.com/arhancanli/license-check-mcp): Open source license answers: SPDX ids, copyleft, and whether a dependency's license fits yours.
- [The whole collection](https://github.com/arhancanli/mcp-factory#servers), 11 more
<!-- family:end -->

## License

MIT, Copyright (c) 2026 Arhan Canli.
