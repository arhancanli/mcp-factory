# Kube Check

<!-- badges:start -->
[![CI](https://github.com/arhancanli/kube-check-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/arhancanli/kube-check-mcp/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/kube-check-mcp)](https://www.npmjs.com/package/kube-check-mcp)
[![downloads](https://img.shields.io/npm/dw/kube-check-mcp)](https://www.npmjs.com/package/kube-check-mcp)
[![OpenSSF Scorecard](https://api.securityscorecards.dev/projects/github.com/arhancanli/kube-check-mcp/badge)](https://scorecard.dev/viewer/?uri=github.com/arhancanli/kube-check-mcp)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
<!-- badges:end -->

Agents write Kubernetes manifests from memory, and memory is several versions old: `extensions/v1beta1`
Ingresses (gone since 1.22), `batch/v1beta1` CronJobs (gone since 1.25), `imagePullPolicy: always`,
`memory: 512mb`, a selector that does not match the pod labels. The cluster refuses them at deploy
time, or worse, accepts them and runs something else. Kube Check checks manifests against the API of
the Kubernetes version you run or are upgrading to, without a cluster:

- **APIs**: what that version serves, what was removed (with the replacement, and the other fields
  that must change: an Ingress moving to `networking.k8s.io/v1` also needs `pathType` and
  `backend.service`), and what is deprecated there, for 1.19 to the newest release.
- **Fields**: unknown or misspelt fields with the one meant, wrong types, enumerated values the
  OpenAPI document leaves out (`Always`, not `always`), quantities (`512Mi`, not `512mb`), and what
  the API server refuses beyond the schema: names, labels, selectors that match no pods, requests
  above limits, probes with two handlers, mounts of volumes that do not exist.
- **Custom resources**: checked against their CRD when it is in the files, else the CRDs catalog
  (cert-manager, Argo, Istio, Prometheus and hundreds more).
- **Pod Security Standards**: baseline by default, restricted on request, check by check as Pod
  Security admission applies them; plus risks such as unpinned images, missing requests and
  secrets written into env.

Every finding has its file, line, rule and fix. Look up any field's meaning, or which apiVersion a
kind needs, in the same version. No cluster or key needed.

Built and maintained by [Arhan Canli](https://github.com/arhancanli).

## Install

<!-- install:start -->
[![Install in Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=kube-check&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsImt1YmUtY2hlY2stbWNwIl19)
[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install_Server-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=kube-check&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22kube-check-mcp%22%5D%7D)
[![Install in Goose](https://block.github.io/goose/img/extension-install-dark.svg)](https://block.github.io/goose/extension?cmd=npx&arg=-y&arg=kube-check-mcp&id=kube-check&name=Kube%20Check&description=Checks%20Kubernetes%20manifests%20(YAML%20or%20JSON%2C%20many%20documents%20per%20file)%20against%20the%20API%20of%20the%20Kubernetes%20version%20you%20run%20or%20plan%20to%20run%2C%201.19%20to%20the%20newest%3A%20APIs%20removed%20or%20deprecated%20there%20with%20their%20replacement%2C%20unknown%20or%20misspelt%20fields%2C%20wrong%20types%2C%20Pod%20Security%20Standards%20(baseline%2C%20restricted)%20and%20common%20risks%20such%20as%20latest%20tags%2C%20missing%20limits%20and%20privileged%20containers.%20Every%20finding%20has%20its%20file%2C%20line%20and%20fix.%20No%20cluster%20or%20key%20needed.)

Needs Node.js 20 or newer. No account or key.

**Claude Code**

```sh
claude mcp add kube-check -- npx -y kube-check-mcp
```

**Claude Desktop**: download `kube-check-mcp-<version>.mcpb` from the [latest release](https://github.com/arhancanli/kube-check-mcp/releases/latest) and open it. The bundle is signed; verify it with `gh attestation verify <file> --repo arhancanli/kube-check-mcp`.

**Any other client** (Windsurf, Zed, Cline, Continue and others), in its MCP config file:

```json
{
  "mcpServers": {
    "kube-check": {
      "command": "npx",
      "args": [
        "-y",
        "kube-check-mcp"
      ]
    }
  }
}
```

**Docker**

```sh
docker build -t kube-check-mcp https://github.com/arhancanli/kube-check-mcp.git && docker run -i --rm kube-check-mcp
```

**Hosted (Streamable HTTP)**: `node src/server.mjs --http` serves stateless MCP at `POST /mcp` (port from `PORT`, default 3000).
<!-- install:end -->

## Example

<!-- example:start -->
An agent calls `check_manifests` with:

```json
{
  "files": [
    {
      "path": "k8s/app.yaml",
      "content": "apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: Web_App\n  labels:\n    app: web\nspec:\n  replicas: 2\n  selector:\n    matchLabels:\n      app: web\n  template:\n    metadata:\n      labels:\n        app: website\n    spec:\n      containers:\n        - name: web\n          image: nginx\n          imagePullPolicy: always\n          port:\n            - containerPort: 80\n          resources:\n            requests:\n              memory: 512mb\n              cpu: \"2\"\n            limits:\n              cpu: \"1\"\n          env:\n            - name: DB_PASSWORD\n              value: hunter2\n            - name: DEBUG\n              value: yes\n          securityContext:\n            privileged: true\n---\napiVersion: extensions/v1beta1\nkind: Ingress\nmetadata:\n  name: web\nspec:\n  rules:\n    - host: example.com\n      http:\n        paths:\n          - path: /\n            backend:\n              serviceName: web\n              servicePort: 80\n---\napiVersion: v1\nkind: Service\nmetadata:\n  name: web\nspec:\n  selector:\n    app: web\n  ports:\n    - port: 80\n      targetPort: http\n---\napiVersion: batch/v1beta1\nkind: CronJob\nmetadata:\n  name: cleanup\nspec:\n  schedule: \"0 3 * *\"\n  jobTemplate:\n    spec:\n      template:\n        spec:\n          containers:\n            - name: c\n              image: busybox:1.36\n---\napiVersion: policy/v1beta1\nkind: PodSecurityPolicy\nmetadata:\n  name: restricted\nspec: {}\n"
    }
  ]
}
```

and gets back (recorded from the live server on 2026-09-27):

```json
{
  "kubernetes_version": "1.37",
  "objects": 5,
  "counts": {
    "error": 12,
    "warning": 5
  },
  "findings": [
    {
      "file": "k8s/app.yaml",
      "line": 4,
      "object": "Deployment/Web_App",
      "severity": "error",
      "rule": "invalid-name",
      "path": "metadata.name",
      "message": "The Deployment name \"Web_App\" is invalid: lowercase letters, digits, '-' and '.', starting and ending with a letter or digit."
    },
    {
      "file": "k8s/app.yaml",
      "line": 9,
      "object": "Deployment/Web_App",
      "severity": "error",
      "rule": "selector-mismatch",
      "path": "spec.selector",
      "message": "The selector does not match the pod template's labels (app=website): the API server refuses it.",
      "fix": "make spec.template.metadata.labels contain every selector label"
    },
    {
      "file": "k8s/app.yaml",
      "line": 20,
      "object": "Deployment/Web_App",
      "severity": "error",
      "rule": "schema",
      "path": "spec.template.spec.containers[0].imagePullPolicy",
      "message": "\"always\" is not an allowed value",
      "did_you_mean": "Always",
      "allowed": [
        "Always",
        "IfNotPresent",
        "Never"
      ]
    },
    {
      "file": "k8s/app.yaml",
      "line": 21,
      "object": "Deployment/Web_App",
      "severity": "error",
      "rule": "schema",
      "path": "spec.template.spec.containers[0].port",
      "message": "unknown property \"port\"",
      "did_you_mean": "ports"
    },
    {
      "file": "k8s/app.yaml",
      "line": 25,
      "object": "Deployment/Web_App",
      "severity": "error",
      "rule": "schema",
      "path": "spec.template.spec.containers[0].resources.requests.memory",
      "message": "\"512mb\" is not a quantity: write 512Mi (powers of 1024) or 512M (powers of 1000); units are Ki Mi Gi Ti Pi Ei or k M G T P E, and m means thousandths",
... (127 more lines)
```
<!-- example:end -->

## Tools

<!-- tools:start -->
| Tool | What it does |
| --- | --- |
| `api_versions` | For Kubernetes kinds (Ingress) or apiVersion/kind pairs (batch/v1beta1/CronJob): the apiVersions a version serves (default: newest), the one to use, and when older ones were deprecated and removed. A named apiVersion gets its status there: served, deprecated or removed, with the replacement. |
| `check_manifests` | Checks Kubernetes manifests (YAML/JSON, multi-document) against a Kubernetes version (default: newest): removed or deprecated APIs with replacements, unknown or wrong fields, what the API server refuses, Pod Security (baseline; restricted on request), risks. Custom resources via their CRD. Findings have file, line, fix. Render Helm/Kustomize first. |
| `field_help` | What a field of a Kubernetes kind means and accepts, from the version's API (default: newest): description, type, allowed values, required sub-fields and the fields under it. field is a dotted path (spec.template.spec.containers[].resources); omit it for the kind's top level. search finds fields by words instead (search: 'rolling update surge'). |
<!-- tools:end -->

## How it behaves

- Read-only: no tool changes anything outside this process. Manifests never leave it; only
  schemas and version data are downloaded.
- Network: HTTPS only, to `raw.githubusercontent.com` and `endoflife.date`, with a deadline, a size
  cap and bounded retries. Sources: each version's API definitions from
  [kubernetes-json-schema](https://github.com/yannh/kubernetes-json-schema) (generated from
  Kubernetes' own OpenAPI document; one 1.5 MB file per version, fetched once and kept), removal and
  deprecation history from [Pluto](https://github.com/FairwindsOps/pluto) (Apache-2.0), custom
  resource schemas from the [CRDs catalog](https://github.com/datreeio/CRDs-catalog) (MIT), and the
  release list from endoflife.date. Nothing is logged except unexpected failures (to stderr,
  without your inputs).
- Read as kubectl reads: YAML 1.1 (`yes` is a boolean, so `value: yes` in env is refused, as the
  API server refuses it), every document of a file, List objects split, comment-only documents
  (Helm's disabled templates) skipped, `null` fields treated as unset.
- Whether an apiVersion is served comes from that version's own definitions; Pluto's table only
  adds when it was deprecated and removed, and a deprecation is reported only when the version also
  serves a newer API to move to. A field the CRDs catalog's schema does not know is a warning, not
  an error, unless it is a near miss of a known field: the installed CRD may be newer.
- Patterns written for Go's regular expressions (`(?i)`, `\z`, `[[:alpha:]]`) are translated; one
  that still cannot run in JavaScript is not checked rather than failing the whole schema.
- Results are compact JSON with a matching output schema: errors first, then warnings, then notes;
  at most 200 findings are listed and the rest counted.

## Benchmark

<!-- bench:start -->
Not yet measured.
<!-- bench:end -->

## Performance

<!-- perf:start -->
Measured 2026-09-27 from Dubai, home connection against the live upstream, Node 24.19.0 (`bench/perf.json`, `scripts/perf.mjs` in the factory).

| Call | First call | Repeat | Result size |
| --- | --- | --- | --- |
| check_manifests: a Deployment with eight mistakes, a removed Ingress, CronJob and PodSecurityPolicy | 906 ms | 2.7 ms | 5,625 chars |
| check_manifests: a clean Deployment, Service and Ingress under the restricted Pod Security level | 907 ms | 2.6 ms | 67 chars |
| check_manifests: a CRD with its resource, a cert-manager Certificate and a pod, restricted | 867 ms | 2.9 ms | 3,186 chars |
| check_manifests: manifests written for 1.24, checked for the upgrade to 1.25 | 748 ms | 1.9 ms | 663 chars |
| check_manifests: the same manifests on 1.24, where they are only deprecated | 578 ms | 2.4 ms | 696 chars |
| api_versions: six kinds and apiVersions | 696 ms | 0.7 ms | 2,010 chars |
| field_help: a Deployment's rolling update surge | 1088 ms | 0.9 ms | 826 chars |
| field_help: search a Pod's fields for 'termination grace' | 1015 ms | 1.9 ms | 1,085 chars |

First call: a fresh server process, including the TLS connection and the upstream's own time. Repeat: the same call again, answered from the in-process cache, so it shows this server's own overhead.

Tool definitions the model reads on every turn (name, description, input schema): 2,212 characters. The full tool list, with the output schemas and annotations clients use to validate results, is 3,614 characters.
<!-- perf:end -->

## More MCP servers by Arhan Canli

<!-- family:start -->
- [Actions Check](https://github.com/arhancanli/actions-check-mcp): Checks GitHub Actions workflows: outdated actions, old Node runtimes, retired runners, injection.
- [Config Check](https://github.com/arhancanli/config-check-mcp): Validates config files against their official schemas: tsconfig, compose, workflows, 1,400+ more.
- [Cron Check](https://github.com/arhancanli/cron-check-mcp): Explains cron expressions, lists next run times in any time zone, converts between cron dialects.
- [Dockerfile Check](https://github.com/arhancanli/dockerfile-check-mcp): Checks Dockerfiles: build-breaking mistakes, base image tags that exist, digests, platforms, EOL.
- [Domain Health](https://github.com/arhancanli/domain-health-mcp): Email and domain checks: SPF lookup limits, DKIM keys, DMARC, DNS records, registration expiry.
- [End of Life](https://github.com/arhancanli/end-of-life-mcp): Is this version still supported? EOL dates, latest patch and upgrade target for 470+ products.
- [Internet Standards](https://github.com/arhancanli/internet-standards-mcp): RFC sections, status, obsoleted-by chains, errata and IANA registries for coding agents.
- [License Check](https://github.com/arhancanli/license-check-mcp): Open source license answers: SPDX ids, copyleft, and whether a dependency's license fits yours.
- [The whole collection](https://github.com/arhancanli/mcp-factory#servers), 12 more
<!-- family:end -->

## License

MIT, Copyright (c) 2026 Arhan Canli.
