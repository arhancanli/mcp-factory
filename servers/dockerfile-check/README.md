# Dockerfile Check

<!-- badges:start -->
[![CI](https://github.com/arhancanli/dockerfile-check-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/arhancanli/dockerfile-check-mcp/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/dockerfile-check-mcp)](https://www.npmjs.com/package/dockerfile-check-mcp)
[![downloads](https://img.shields.io/npm/dw/dockerfile-check-mcp)](https://www.npmjs.com/package/dockerfile-check-mcp)
[![OpenSSF Scorecard](https://api.securityscorecards.dev/projects/github.com/arhancanli/dockerfile-check-mcp/badge)](https://scorecard.dev/viewer/?uri=github.com/arhancanli/dockerfile-check-mcp)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
<!-- badges:end -->

Dockerfiles written by agents fail in two ways. Some never build: `apt-get install` without `-y`
waits for an answer the build cannot give, `COPY ../x` reaches outside the context, a tag like
`node:18.99-alpine` does not exist, `COPY --from=dep` names a stage called `deps`. Others build and
ship a problem: Node.js 18 or Python 3.8 past their end of life, a secret in `ENV`, a container
running as root, an image missing the arm64 build the servers need. Dockerfile Check finds both:

- **Syntax** with the validator behind VS Code's Dockerfile support, and the rules a build and a
  review apply: install commands without `-y`, copies from outside the context, unknown or later
  stages, exec form in single quotes, invalid ports, legacy `ENV`, several `CMD`s.
- **Every base image against its registry**: the tag exists (with the nearest real tags when it
  does not), its digest and a pinned `FROM` line, the platforms it is built for, when Docker Hub
  last rebuilt it. Docker Hub, GHCR, Quay, GCR, MCR, ECR Public and registry.k8s.io.
- **End of life** of what the image is built on, runtime and OS alike (`python:3.8-slim-buster` is
  Python 3.8 and Debian 10), with an upgrade tag that exists (`python:3.14-slim`).
- **Security and size**: root users, secrets in `ENV` and `ARG`, `sudo`, unverified `ADD` URLs,
  package caches left in layers, dependency installs placed after `COPY . .`.

Every finding has its line and fix. `image_info` answers the same questions for images named in
compose files, Kubernetes manifests or CI jobs. No key needed.

Built and maintained by [Arhan Canli](https://github.com/arhancanli).

## Install

<!-- install:start -->
[![Install in Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=dockerfile-check&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsImRvY2tlcmZpbGUtY2hlY2stbWNwIl19)
[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install_Server-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=dockerfile-check&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22dockerfile-check-mcp%22%5D%7D)
[![Install in Goose](https://block.github.io/goose/img/extension-install-dark.svg)](https://block.github.io/goose/extension?cmd=npx&arg=-y&arg=dockerfile-check-mcp&id=dockerfile-check&name=Dockerfile%20Check&description=Checks%20Dockerfiles%20the%20way%20a%20build%20and%20a%20security%20review%20would%3A%20syntax%2C%20instructions%20that%20break%20or%20slow%20the%20build%20(apt-get%20install%20without%20-y%2C%20copies%20from%20outside%20the%20context%2C%20exec%20form%20with%20single%20quotes)%2C%20risky%20patterns%20(root%20user%2C%20secrets%20in%20ENV%20or%20ARG%2C%20unpinned%20images)%2C%20and%20every%20base%20image%20against%20its%20registry%3A%20whether%20the%20tag%20exists%20(with%20the%20nearest%20real%20tags%20when%20it%20does%20not)%2C%20its%20digest%20to%20pin%2C%20the%20platforms%20it%20is%20built%20for%2C%20when%20it%20was%20last%20rebuilt%2C%20and%20whether%20its%20runtime%20and%20OS%20are%20past%20end%20of%20life.%20Docker%20Hub%2C%20GHCR%2C%20Quay%2C%20GCR%2C%20MCR%2C%20ECR%20Public%20and%20registry.k8s.io.%20No%20key.)

Needs Node.js 20 or newer. No account or key.

**Claude Code**

```sh
claude mcp add dockerfile-check -- npx -y dockerfile-check-mcp
```

**Claude Desktop**: download `dockerfile-check-mcp-<version>.mcpb` from the [latest release](https://github.com/arhancanli/dockerfile-check-mcp/releases/latest) and open it. The bundle is signed; verify it with `gh attestation verify <file> --repo arhancanli/dockerfile-check-mcp`.

**Any other client** (Windsurf, Zed, Cline, Continue and others), in its MCP config file:

```json
{
  "mcpServers": {
    "dockerfile-check": {
      "command": "npx",
      "args": [
        "-y",
        "dockerfile-check-mcp"
      ]
    }
  }
}
```

**Docker**

```sh
docker build -t dockerfile-check-mcp https://github.com/arhancanli/dockerfile-check-mcp.git && docker run -i --rm dockerfile-check-mcp
```

**Hosted (Streamable HTTP)**: `node src/server.mjs --http` serves stateless MCP at `POST /mcp` (port from `PORT`, default 3000).
<!-- install:end -->

## Example

<!-- example:start -->
An agent calls `check_dockerfile` with:

```json
{
  "files": [
    {
      "path": "Dockerfile",
      "content": "ARG NODE_VERSION=18\nFROM node:${NODE_VERSION}-alpine AS deps\nWORKDIR /app\nCOPY package*.json ./\nRUN npm ci\n\nFROM node:${NODE_VERSION}-alpine AS build\nWORKDIR /app\nCOPY --from=dep /app/node_modules ./node_modules\nCOPY . .\nRUN npm run build\n\nFROM python:3.8-slim-buster\nMAINTAINER ops@example.com\nARG GITHUB_TOKEN\nRUN apt-get update\nRUN apt-get install curl git\nCOPY ../shared/config.yml /etc/app/\nCOPY --from=build /app/dist /srv\nENV DATABASE_PASSWORD=hunter2\nEXPOSE 8080/http\nUSER root\nCMD ['python', '-m', 'http.server', '8080']\n"
    }
  ]
}
```

and gets back (recorded from the live server on 2026-09-27):

```json
{
  "files": [
    {
      "path": "Dockerfile",
      "counts": {
        "error": 5,
        "warning": 9,
        "info": 2
      },
      "findings": [
        {
          "line": 9,
          "severity": "error",
          "rule": "unknown-stage",
          "message": "--from=dep names no earlier stage (stages: deps, build), so Docker pulls an image called dep.",
          "fix": "use a stage name defined above, or a full image reference"
        },
        {
          "line": 17,
          "severity": "error",
          "rule": "install-without-yes",
          "message": "apt-get install without -y waits for a confirmation the build cannot give, and the build fails.",
          "fix": "add -y (and --no-install-recommends)"
        },
        {
          "line": 18,
          "severity": "error",
          "rule": "outside-context",
          "message": "COPY cannot reach outside the build context (../shared/config.yml).",
          "fix": "move the file into the context, or build from a parent directory"
        },
        {
          "line": 21,
          "severity": "error",
          "rule": "invalid-port",
          "message": "EXPOSE 8080/http is not a port (1-65535, optionally /tcp or /udp)."
        },
        {
          "line": 23,
          "severity": "error",
          "rule": "exec-form-quotes",
          "message": "Exec form needs double quotes: with single quotes this is run as a shell command, brackets and all.",
          "fix": "write [\"cmd\", \"arg\"]"
        },
        {
          "line": 2,
          "severity": "warning",
          "rule": "end-of-life",
          "message": "node:18-alpine is built on Node.js 18, past its end of life (2025-04-30): no more security fixes.",
          "fix": "use node:24-alpine"
        },
        {
          "line": 7,
          "severity": "warning",
          "rule": "end-of-life",
          "message": "node:18-alpine is built on Node.js 18, past its end of life (2025-04-30): no more security fixes.",
          "fix": "use node:24-alpine"
        },
        {
          "line": 13,
... (125 more lines)
```
<!-- example:end -->

## Tools

<!-- tools:start -->
| Tool | What it does |
| --- | --- |
| `check_dockerfile` | Checks Dockerfiles: syntax, what breaks the build (apt-get install without -y, copies outside the context, unknown stages), root users, secrets in ENV/ARG, cache order, and each base image against its registry (tag exists, digest to pin, platforms, last rebuild) and end-of-life dates. Findings have line and fix. |
| `image_info` | For container image references (node:20-alpine, ghcr.io/org/app:1.2): whether the tag exists (nearest real tags if not), its digest and a pinned reference, platforms, last rebuild (Docker Hub), and end-of-life status of its runtime and OS with an upgrade tag. Docker Hub, GHCR, Quay, GCR, MCR, ECR Public, registry.k8s.io. |
<!-- tools:end -->

## How it behaves

- Read-only: no tool changes anything outside this process. Dockerfiles never leave it; only
  image names are looked up.
- Network: HTTPS only, to the hosts in `package.json` under `factory.allowHosts`, with a deadline,
  a size cap and bounded retries. Docker Hub is read through its tag API, which does not spend the
  anonymous pull allowance; the other registries through the OCI distribution API with anonymous
  tokens (registry.k8s.io through the regional Artifact Registry it redirects to). Private
  registries and private images are named as such and not contacted further. End-of-life dates
  come from endoflife.date. Registry answers are kept for 30 minutes, since tags move. Nothing is
  logged except unexpected failures (to stderr, without your inputs).
- `FROM` lines are read as Docker reads them: ARG defaults declared before the first `FROM` are
  filled in, `scratch` and earlier stages are not images, and `--platform` on a `FROM` wins over the
  platform you pass.
- A digest is the registry's `Docker-Content-Digest`, or the SHA-256 of the manifest when a registry
  does not send one (ECR Public).
- Results are compact JSON with a matching output schema: errors first, then warnings, then notes.

## Benchmark

<!-- bench:start -->
Not yet measured.
<!-- bench:end -->

## Performance

<!-- perf:start -->
Measured 2026-09-27 from Dubai, home connection against the live upstream, Node 24.19.0 (`bench/perf.json`, `scripts/perf.mjs` in the factory).

| Call | First call | Repeat | Result size |
| --- | --- | --- | --- |
| check_dockerfile: a three-stage Dockerfile with twelve problems | 1983 ms | 1.3 ms | 4,787 chars |
| check_dockerfile: a clean two-stage Node.js build | 836 ms | 1.6 ms | 443 chars |
| check_dockerfile: an amd64-only base image built for linux/arm64 | 777 ms | 0.8 ms | 873 chars |
| image_info: nine references across seven registries | 2286 ms | 1.5 ms | 3,174 chars |

First call: a fresh server process, including the TLS connection and the upstream's own time. Repeat: the same call again, answered from the in-process cache, so it shows this server's own overhead.

Tool definitions the model reads on every turn (name, description, input schema): 1,429 characters. The full tool list, with the output schemas and annotations clients use to validate results, is 2,364 characters.
<!-- perf:end -->

## More MCP servers by Arhan Canli

<!-- family:start -->
- [Actions Check](https://github.com/arhancanli/actions-check-mcp): Checks GitHub Actions workflows: outdated actions, old Node runtimes, retired runners, injection.
- [Config Check](https://github.com/arhancanli/config-check-mcp): Validates config files against their official schemas: tsconfig, compose, workflows, 1,400+ more.
- [Cron Check](https://github.com/arhancanli/cron-check-mcp): Explains cron expressions, lists next run times in any time zone, converts between cron dialects.
- [Domain Health](https://github.com/arhancanli/domain-health-mcp): Email and domain checks: SPF lookup limits, DKIM keys, DMARC, DNS records, registration expiry.
- [End of Life](https://github.com/arhancanli/end-of-life-mcp): Is this version still supported? EOL dates, latest patch and upgrade target for 470+ products.
- [Internet Standards](https://github.com/arhancanli/internet-standards-mcp): RFC sections, status, obsoleted-by chains, errata and IANA registries for coding agents.
- [Kube Check](https://github.com/arhancanli/kube-check-mcp): Checks Kubernetes manifests for your version: removed APIs, unknown fields, Pod Security, risks.
- [License Check](https://github.com/arhancanli/license-check-mcp): Open source license answers: SPDX ids, copyleft, and whether a dependency's license fits yours.
- [The whole collection](https://github.com/arhancanli/mcp-factory#servers), 11 more
<!-- family:end -->

## License

MIT, Copyright (c) 2026 Arhan Canli.
