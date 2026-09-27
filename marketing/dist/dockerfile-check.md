# Dockerfile Check: launch kit

Numbers are filled from the server's measured files (`node scripts/launch-kit.mjs dockerfile-check`).
Post only after the release is on npm.

## Positioning

- One line: checks Dockerfiles the way a build and a review would, and checks every base image
  against its registry and its end-of-life date.
- Who it is for: developers and platform teams whose agents write or update Dockerfiles, and anyone
  pinning images for supply-chain rules.
- Why now: agents write Dockerfiles from memory, so they reach for tags that never existed, base
  images years past their end of life, and install commands that hang the build.
- Proof: the validator behind VS Code's Dockerfile support, build-breaking rules with fixes, seven
  registries read live (tag, digest, platforms, last rebuild), runtime and OS end-of-life with an
  upgrade tag that exists. Tool definitions of 1,429 characters.

## Show HN

**Title:** Show HN: Dockerfile Check, an MCP server that checks Dockerfiles and their base images

**Text:**

When an AI agent writes a Dockerfile, the usual failures are small: apt-get install without -y
(the build waits for a yes that never comes), COPY ../config reaching outside the context, a tag
like node:18.99-alpine that does not exist, COPY --from=dep when the stage is called deps. The rest
build fine and ship a problem: Node.js 18 or Python 3.8 past their end of life, secrets in ENV, root.

I built an MCP server that checks Dockerfiles for all of that and looks every base image up in its
registry: whether the tag exists (and the nearest ones that do), the digest to pin, the platforms it
is built for, when it was last rebuilt, and whether its runtime and OS still get security fixes,
with an upgrade tag that exists. Docker Hub, GHCR, Quay, GCR, MCR, ECR Public and registry.k8s.io,
anonymously; Docker Hub through its tag API, so pull limits are not touched.

MIT: https://github.com/arhancanli/dockerfile-check-mcp. `npx -y dockerfile-check-mcp`

## Reddit: r/docker, r/devops (check each subreddit's rules first)

**Title:** Free tool so AI agents stop writing Dockerfiles that don't build (or build on end-of-life images)

**Text:** Build-breaking rules with fixes, tags checked against the registry (digest, platforms, last
rebuild), end of life for runtime and OS, root users and secrets. Works in Claude Code, Cursor and
other MCP clients. https://github.com/arhancanli/dockerfile-check-mcp

## Reddit: r/mcp

**Title:** Dockerfile Check: Dockerfiles and base images checked in 2 tools

**Text:** `check_dockerfile`, `image_info`. Tool definitions 1,429 characters. `claude mcp add dockerfile-check -- npx -y dockerfile-check-mcp`. https://github.com/arhancanli/dockerfile-check-mcp

## X / Bluesky thread

1. apt-get install without -y. COPY ../config. FROM node:18.99-alpine. The Dockerfiles agents write fail on small things.
2. I built an MCP server that checks Dockerfiles and looks every base image up in its registry: tag, digest, platforms, last rebuild.
3. Plus end of life for the runtime and the OS under it, with an upgrade tag that actually exists.
4. Free, MIT: https://github.com/arhancanli/dockerfile-check-mcp

## LinkedIn

Container images inherit whatever their base image carries, and AI agents now write a lot of
Dockerfiles from outdated examples. I built Dockerfile Check, an open-source MCP server that checks
Dockerfiles for what breaks builds and what weakens images, and verifies every base image against
its registry and its end-of-life date before anything is built. https://github.com/arhancanli/dockerfile-check-mcp

## awesome-mcp-servers entry (Developer Tools)

- [arhancanli/dockerfile-check-mcp](https://github.com/arhancanli/dockerfile-check-mcp) 📇 ☁️ 🍎 🪟 🐧 - Checks Dockerfiles (syntax, build-breaking rules, root, secrets, cache order) and every base image against its registry (tag exists, digest, platforms, last rebuild) and end-of-life dates. Docker Hub, GHCR, Quay, GCR, MCR, ECR Public, registry.k8s.io.

## Directory blurbs

- Short: Checks Dockerfiles: build-breaking mistakes, base image tags that exist, digests, platforms, EOL.
- Long: Checks Dockerfiles the way a build and a security review would: syntax, instructions that break or slow the build (apt-get install without -y, copies from outside the context, exec form with single quotes), risky patterns (root user, secrets in ENV or ARG, unpinned images), and every base image against its registry: whether the tag exists (with the nearest real tags when it does not), its digest to pin, the platforms it is built for, when it was last rebuilt, and whether its runtime and OS are past end of life. Docker Hub, GHCR, Quay, GCR, MCR, ECR Public and registry.k8s.io. No key.

## Cross-links

Footer: 19 servers, each measured before release: https://github.com/topics/arhancanli-mcp. Related: Actions Check (https://github.com/arhancanli/actions-check-mcp), Citation Check (https://github.com/arhancanli/citation-check-mcp), Config Check (https://github.com/arhancanli/config-check-mcp).
