# Kube Check: launch kit

Numbers are filled from the server's measured files (`node scripts/launch-kit.mjs kube-check`).
Post only after the release is on npm.

## Positioning

- One line: checks Kubernetes manifests against the version you run or are upgrading to, the way
  the API server will, without a cluster.
- Who it is for: platform and DevOps engineers, and developers whose agents write or upgrade
  manifests, Helm charts and Kustomize overlays.
- Why now: agents write Kubernetes YAML from training data that is several releases old, so they
  reach for APIs that were removed years ago; every cluster upgrade finds the same breakage late.
- Proof: 1.19 to the newest release from Kubernetes' own OpenAPI definitions, removed APIs with the
  fields a migration also changes, the enum values and quantity rules the OpenAPI document leaves
  out, Pod Security baseline and restricted, custom resources through their CRDs. Tool definitions
  of 2,212 characters.

## Show HN

**Title:** Show HN: Kube Check, an MCP server that checks Kubernetes manifests for a target version

**Text:**

Ask an AI agent for an Ingress and you often get extensions/v1beta1, which Kubernetes removed in
1.22. Ask for resources and you get memory: 512mb (not a quantity) or imagePullPolicy: always (the
API wants Always). The cluster refuses these at deploy time; upgrades find the old APIs months later.

I built an MCP server that checks manifests against the API of a specific Kubernetes version, from
the OpenAPI definitions Kubernetes publishes for each release: removed and deprecated APIs with the
replacement (and, for a removed API, the other fields the migration changes), unknown fields with
the one meant, the enum values and quantity grammar the OpenAPI document does not state, what the
API server refuses beyond the schema (selectors that match no pods, requests above limits), Pod
Security baseline and restricted check by check, and custom resources through their CRDs. It reads
YAML the way kubectl does (YAML 1.1: `value: yes` is a boolean and is refused).

No cluster, no key. MIT: https://github.com/arhancanli/kube-check-mcp. `npx -y kube-check-mcp`

## Reddit: r/kubernetes, r/devops (check each subreddit's rules first)

**Title:** Free tool so AI agents stop writing removed Kubernetes APIs: manifest checks for any version, no cluster

**Text:** Removed/deprecated APIs with replacements, unknown fields, quantities, selectors, Pod
Security restricted, CRDs. Pick 1.19 to the newest. Works in Claude Code, Cursor and other MCP
clients. https://github.com/arhancanli/kube-check-mcp

## Reddit: r/mcp

**Title:** Kube Check: Kubernetes manifests checked for a target version in 3 tools

**Text:** `api_versions`, `check_manifests`, `field_help`. Tool definitions 2,212 characters. `claude mcp add kube-check -- npx -y kube-check-mcp`. https://github.com/arhancanli/kube-check-mcp

## X / Bluesky thread

1. Ask an agent for an Ingress and you still get extensions/v1beta1. Kubernetes removed it in 1.22.
2. I built an MCP server that checks manifests against the API of the version you run or are upgrading to, from Kubernetes' own OpenAPI definitions. No cluster needed.
3. Removed APIs with the fields a migration changes, 512mb vs 512Mi, always vs Always, selectors that match nothing, Pod Security restricted, CRDs.
4. Free, MIT: https://github.com/arhancanli/kube-check-mcp

## LinkedIn

Every Kubernetes upgrade surfaces manifests that use APIs the new version no longer serves, and AI
agents now write many of those manifests from outdated examples. I built Kube Check, an
open-source MCP server that checks manifests against a chosen Kubernetes version the way the API
server will, including Pod Security and custom resources, before anything reaches a cluster.
https://github.com/arhancanli/kube-check-mcp

## awesome-mcp-servers entry (Developer Tools)

- [arhancanli/kube-check-mcp](https://github.com/arhancanli/kube-check-mcp) 📇 ☁️ 🍎 🪟 🐧 - Checks Kubernetes manifests against a chosen version (1.19 to newest) without a cluster: removed/deprecated APIs with migrations, unknown fields, quantities, API-server rules, Pod Security baseline/restricted, CRDs; field and apiVersion lookup.

## Directory blurbs

- Short: Checks Kubernetes manifests for your version: removed APIs, unknown fields, Pod Security, risks.
- Long: Checks Kubernetes manifests (YAML or JSON, many documents per file) against the API of the Kubernetes version you run or plan to run, 1.19 to the newest: APIs removed or deprecated there with their replacement, unknown or misspelt fields, wrong types, Pod Security Standards (baseline, restricted) and common risks such as latest tags, missing limits and privileged containers. Every finding has its file, line and fix. No cluster or key needed.

## Cross-links

Footer: 18 servers, each measured before release: https://github.com/topics/arhancanli-mcp. Related: Actions Check (https://github.com/arhancanli/actions-check-mcp), Citation Check (https://github.com/arhancanli/citation-check-mcp), Config Check (https://github.com/arhancanli/config-check-mcp).
