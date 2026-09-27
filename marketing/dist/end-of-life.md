# End of Life: launch kit

Numbers are filled from the server's measured files (`node scripts/launch-kit.mjs end-of-life`).
Post only after the release is on npm.

## Positioning

- One line: tells coding agents when a runtime, database or OS version is out of support, straight
  from the project's own files.
- Who it is for: developers and teams using coding agents, DevOps and security engineers, anyone
  maintaining old services.
- Why now: agents still write `FROM node:18` and `python-version: 3.8`, versions that stopped
  getting security fixes; the versions hide in image tags, `.nvmrc` codenames and CI runners.
- Proof: reads Dockerfiles (including the OS inside image tags), version files, manifests and CI
  workflows; gives status, dates, latest patch, newest target and smallest safe jump. Tool
  definitions of 1,706 characters against 6,734 for endoflife-mcp, the only published end-of-life server.

## Show HN

**Title:** Show HN: End of Life, an MCP server that finds out-of-support versions in your repo

**Text:**

Coding agents pick versions from memory, so they keep writing Node 18 and Python 3.8 long after
security fixes stopped. I built an MCP server that reads a project's Dockerfile, .nvmrc,
.python-version, .tool-versions, package.json engines, pyproject.toml, go.mod and GitHub Actions
workflows, finds every pinned runtime, database and OS version (including the Debian or Alpine
version hidden in an image tag, and `lts/hydrogen` in an .nvmrc), and checks each against
endoflife.date.

For each it says supported, security fixes only, paid extended support only, or end of life, with
days left, the latest patch, the newest version to move to, and the smallest jump that still gets
fixes. Status is computed from the dates on the day you ask.

No key, MIT: https://github.com/arhancanli/end-of-life-mcp. `npx -y end-of-life-mcp`

## Reddit: r/devops, r/webdev (check each subreddit's rules first)

**Title:** Free tool that finds end-of-life runtimes and OS images in a repo, for AI coding agents

**Text:** Point it at your Dockerfile, CI workflows and version files; it lists every pinned runtime,
database and OS version with its support status, days left and what to upgrade to. Works in Claude
Code, Cursor and others. https://github.com/arhancanli/end-of-life-mcp

## Reddit: r/mcp

**Title:** End of Life: support status for 470+ products from a repo's own files, 3 tools

**Text:** `check_project`, `check_versions`, `product_lifecycle`. Tool definitions 1,706 characters. `claude mcp add end-of-life -- npx -y end-of-life-mcp`. https://github.com/arhancanli/end-of-life-mcp

## X / Bluesky thread

1. AI coding agents still write FROM node:18 and python 3.8. Both are past end of life.
2. I built an MCP server that reads your Dockerfile, .nvmrc, CI and manifests and checks every pinned version against endoflife.date.
3. It finds the OS hiding in image tags (python:3.8-slim-bullseye is Debian 11) and suggests the smallest safe upgrade.
4. Free, MIT: https://github.com/arhancanli/end-of-life-mcp

## LinkedIn

Out-of-support runtimes are one of the most common findings in security reviews, and AI coding
agents keep adding them. I built End of Life, an open-source MCP server that reads a project's own
files, finds every pinned runtime, database and OS version, and reports its support status, days
left and upgrade path. https://github.com/arhancanli/end-of-life-mcp

## awesome-mcp-servers entry (Developer Tools)

- [arhancanli/end-of-life-mcp](https://github.com/arhancanli/end-of-life-mcp) 📇 🏠 🍎 🪟 🐧 - Finds pinned runtime, database and OS versions in Dockerfiles, version files, manifests and CI workflows and checks each against endoflife.date: status, days left, latest patch, upgrade target.

## Directory blurbs

- Short: Is this version still supported? EOL dates, latest patch and upgrade target for 470+ products.
- Long: Tells coding agents whether a runtime, framework, database or OS version is still supported: end-of-life and security-support dates, days left, the latest patch and the version to upgrade to, for 470+ products, straight from a project's Dockerfile, .nvmrc, package.json, pyproject.toml, go.mod and CI files.

## Cross-links

Footer: 21 servers, each measured before release: https://github.com/topics/arhancanli-mcp. Related: Actions Check (https://github.com/arhancanli/actions-check-mcp), Citation Check (https://github.com/arhancanli/citation-check-mcp), Config Check (https://github.com/arhancanli/config-check-mcp).
