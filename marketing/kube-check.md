# {{title}}: launch kit

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
  of {{tool_chars}} characters.

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

No cluster, no key. MIT: {{repo}}. `{{install}}`

## Reddit: r/kubernetes, r/devops (check each subreddit's rules first)

**Title:** Free tool so AI agents stop writing removed Kubernetes APIs: manifest checks for any version, no cluster

**Text:** Removed/deprecated APIs with replacements, unknown fields, quantities, selectors, Pod
Security restricted, CRDs. Pick 1.19 to the newest. Works in Claude Code, Cursor and other MCP
clients. {{repo}}

## Reddit: r/mcp

**Title:** Kube Check: Kubernetes manifests checked for a target version in {{tool_count}} tools

**Text:** {{tool_names}}. Tool definitions {{tool_chars}} characters. `{{claude_code_install}}`. {{repo}}

## X / Bluesky thread

1. Ask an agent for an Ingress and you still get extensions/v1beta1. Kubernetes removed it in 1.22.
2. I built an MCP server that checks manifests against the API of the version you run or are upgrading to, from Kubernetes' own OpenAPI definitions. No cluster needed.
3. Removed APIs with the fields a migration changes, 512mb vs 512Mi, always vs Always, selectors that match nothing, Pod Security restricted, CRDs.
4. Free, MIT: {{repo}}

## LinkedIn

Every Kubernetes upgrade surfaces manifests that use APIs the new version no longer serves, and AI
agents now write many of those manifests from outdated examples. I built Kube Check, an
open-source MCP server that checks manifests against a chosen Kubernetes version the way the API
server will, including Pod Security and custom resources, before anything reaches a cluster.
{{repo}}

## awesome-mcp-servers entry (Developer Tools)

- [arhancanli/{{package}}]({{repo}}) 📇 ☁️ 🍎 🪟 🐧 - Checks Kubernetes manifests against a chosen version (1.19 to newest) without a cluster: removed/deprecated APIs with migrations, unknown fields, quantities, API-server rules, Pod Security baseline/restricted, CRDs; field and apiVersion lookup.

## Directory blurbs

- Short: {{summary}}
- Long: {{description}}

## Cross-links

Footer: {{collection_size}} servers, each measured before release: {{collection_topic}}. Related: {{related}}.
