// Unit rules: quantities, names and labels, Go patterns, versions, parsing as kubectl reads YAML,
// the schema preparation, Pod Security check by check, the API server's own checks and the checks
// across objects. No network.
import assert from "node:assert/strict";
import test from "node:test";
import { withoutNulls } from "../src/check.mjs";
import { parseManifests } from "../src/parse.mjs";
import { crossChecks, labelKeyProblem, labelValueProblem, objectChecks, podSecurity, quantity, quantityHint } from "../src/rules.mjs";
import { goRegExp, prepare, QUANTITY } from "../src/schema.mjs";
import { parseKindQuery } from "../src/tools/api-versions.mjs";
import { parseVersion, splitApiVersion, versionRank } from "../src/versions.mjs";

test("quantities: the API machinery's grammar, and what was probably meant", () => {
  const re = new RegExp(QUANTITY);
  for (const ok of ["500m", "1", "1.5", "256Mi", "1Gi", "2e3", "1k", "0.5", ".5", "100M", "+1Ki"]) assert.ok(re.test(ok), ok);
  for (const bad of ["512mb", "1GB", "1K", "1gi", "0.5cpu", "1 Gi", "Mi", ""]) assert.ok(!re.test(bad), bad);
  assert.equal(quantity("500m"), 0.5);
  assert.equal(quantity("1Gi"), 2 ** 30);
  assert.equal(quantity("2e3"), 2000);
  assert.equal(quantity(3), 3);
  assert.equal(quantity("1GB"), undefined);
  assert.deepEqual([quantityHint("512mb").did_you_mean, quantityHint("1GB").did_you_mean, quantityHint("1K").did_you_mean], ["512Mi", "1Gi", "1Ki"]);
  assert.match(quantityHint("1K").message, /1Ki \(powers of 1024\) or 1k \(powers of 1000\)/);
  assert.equal(quantityHint("lots").did_you_mean, undefined);
});

test("labels: prefixed keys, 63-character names and values, empty values allowed", () => {
  assert.equal(labelKeyProblem("app.kubernetes.io/name"), undefined);
  assert.equal(labelKeyProblem("app"), undefined);
  assert.match(labelKeyProblem("my_domain/app"), /prefix/);
  assert.match(labelKeyProblem("-app"), /name part/);
  assert.match(labelKeyProblem("a".repeat(64)), /1 to 63/);
  assert.equal(labelValueProblem(""), undefined);
  assert.equal(labelValueProblem("v1.2.3"), undefined);
  assert.match(labelValueProblem("has space"), /letters, digits/);
  assert.match(labelValueProblem("x".repeat(64)), /at most 63/);
});

test("Go patterns run in JavaScript: inline flags, \\z, POSIX classes; the rest are not checked", () => {
  const ci = goRegExp("^(?i)(abort|warn)?$", "u");
  assert.ok(ci.test("ABORT") && ci.test("warn") && !ci.test("stop"));
  assert.ok(goRegExp("^[[:alpha:]]+\\z", "u").test("abc") && !goRegExp("^[[:alpha:]]+\\z", "u").test("ab1"));
  assert.ok(goRegExp("(?<=x)y(", "u").test("anything"), "unrunnable: not checked rather than failing the schema");
});

test("versions and kinds as people write them", () => {
  assert.deepEqual(["1.30", "v1.30.2", "1.30.0", "2.0", "1.3x"].map(parseVersion), [30, 30, 30, undefined, undefined]);
  assert.deepEqual(splitApiVersion("apps/v1"), { group: "apps", version: "v1" });
  assert.deepEqual(splitApiVersion("v1"), { group: "", version: "v1" });
  assert.ok(versionRank("v1") > versionRank("v1beta3") && versionRank("v1beta3") > versionRank("v1beta1") && versionRank("v1beta1") > versionRank("v1alpha1") && versionRank("v2") > versionRank("v1"));
  assert.deepEqual(parseKindQuery("extensions/v1beta1 Ingress"), { apiVersion: "extensions/v1beta1", kind: "Ingress" });
  assert.deepEqual(parseKindQuery("batch/v1beta1/CronJob"), { apiVersion: "batch/v1beta1", kind: "CronJob" });
  assert.deepEqual(parseKindQuery("Ingress"), { kind: "Ingress" });
});

test("parsing: YAML 1.1 booleans as kubectl reads them, Lists split, comment-only documents skipped, lines", () => {
  // Helm renders a disabled template as "---" and a comment: a document with no object.
  const { objects, problems } = parseManifests("---\n# Source: chart/templates/off.yaml\n---\napiVersion: v1\nkind: List\nitems:\n  - apiVersion: v1\n    kind: ConfigMap\n    metadata:\n      name: a\n    data:\n      flag: yes\n---\n- not an object\n");
  assert.equal(objects.length, 1);
  assert.equal(objects[0].obj.data.flag, true, "yes is a boolean in YAML 1.1");
  assert.equal(objects[0].lineOf(["data", "flag"], true), 12);
  assert.equal(objects[0].line, 8);
  assert.deepEqual(problems.map((p) => p.line), [14]);
  assert.match(parseManifests("a: [1\n").problems[0].message, /^not valid YAML/);
});

test("schema preparation: enums added, objects closed except inside anyOf/oneOf, quantities patterned", () => {
  const doc = prepare({
    definitions: {
      "io.k8s.api.core.v1.Container": { type: "object", properties: { imagePullPolicy: { type: "string" }, name: { type: "string" } } },
      "io.k8s.apimachinery.pkg.api.resource.Quantity": { oneOf: [{ type: "string" }, { type: "number" }] },
      "x.Choice": { type: "object", properties: { a: {}, b: {} }, anyOf: [{ properties: { a: {} }, required: ["a"] }] },
      "x.Open": { type: "object", properties: { a: {} }, "x-kubernetes-preserve-unknown-fields": true },
    },
  });
  const d = doc.definitions;
  assert.deepEqual(d["io.k8s.api.core.v1.Container"].properties.imagePullPolicy.enum, ["Always", "IfNotPresent", "Never"]);
  assert.equal(d["io.k8s.api.core.v1.Container"].additionalProperties, false);
  assert.equal(d["io.k8s.apimachinery.pkg.api.resource.Quantity"].oneOf[0].pattern, QUANTITY);
  assert.equal(d["x.Choice"].additionalProperties, false);
  assert.equal(d["x.Choice"].anyOf[0].additionalProperties, undefined, "a branch lists only what it constrains");
  assert.equal(d["x.Open"].additionalProperties, undefined);
  assert.deepEqual(withoutNulls({ a: null, b: { c: null, d: 1 }, e: [null, 2] }), { b: { d: 1 }, e: [null, 2] });
});

const deployment = (spec, labels = { app: "a" }, extra = {}) => ({ apiVersion: "apps/v1", kind: "Deployment", metadata: { name: "a", ...extra }, spec: { selector: { matchLabels: { app: "a" } }, template: { metadata: { labels }, spec } } });

test("Pod Security baseline: each check, and nothing on a plain pod", () => {
  const base = { containers: [{ name: "c", image: "x:1" }] };
  assert.deepEqual(podSecurity(deployment(base), "Deployment", "baseline"), []);
  const bad = {
    hostPID: true,
    volumes: [{ name: "h", hostPath: { path: "/" } }],
    securityContext: { sysctls: [{ name: "kernel.msgmax", value: "1" }, { name: "net.ipv4.tcp_syncookies", value: "1" }], seccompProfile: { type: "Unconfined" } },
    containers: [{ name: "c", image: "x:1", ports: [{ containerPort: 80, hostPort: 80 }], securityContext: { privileged: true, procMount: "Unmasked", capabilities: { add: ["NET_BIND_SERVICE", "SYS_ADMIN"] }, seLinuxOptions: { user: "root" } } }],
  };
  const rules = podSecurity(deployment(bad), "Deployment", "baseline").map((f) => f.rule.split("/")[1]);
  assert.deepEqual(rules.sort(), ["capabilities", "host-namespaces", "host-path-volumes", "host-ports", "privileged", "proc-mount", "seccomp", "selinux", "sysctls"]);
  assert.ok(!podSecurity(deployment(bad), "Deployment", "baseline").some((f) => f.level === "restricted"));
});

test("Pod Security restricted: pod-level settings cover every container; Windows pods skip Linux-only checks", () => {
  const good = { securityContext: { runAsNonRoot: true, seccompProfile: { type: "RuntimeDefault" } }, containers: [{ name: "c", image: "x:1", securityContext: { allowPrivilegeEscalation: false, capabilities: { drop: ["ALL"], add: ["NET_BIND_SERVICE"] } } }] };
  assert.deepEqual(podSecurity(deployment(good), "Deployment", "restricted"), []);
  const bare = { containers: [{ name: "c", image: "x:1" }], volumes: [{ name: "n", nfs: { server: "s", path: "/" } }] };
  assert.deepEqual(podSecurity(deployment(bare), "Deployment", "restricted").map((f) => f.rule.split("/")[1]).sort(), ["capabilities", "privilege-escalation", "run-as-non-root", "seccomp", "volume-types"]);
  const windows = { os: { name: "windows" }, securityContext: { runAsNonRoot: true, seccompProfile: { type: "RuntimeDefault" } }, containers: [{ name: "c", image: "x:1" }] };
  assert.deepEqual(podSecurity(deployment(windows), "Deployment", "restricted"), []);
  const root = { securityContext: { runAsNonRoot: true, runAsUser: 0, seccompProfile: { type: "RuntimeDefault" } }, containers: [{ name: "c", image: "x:1", securityContext: { allowPrivilegeEscalation: false, capabilities: { drop: ["ALL"] } } }] };
  assert.deepEqual(podSecurity(deployment(root), "Deployment", "restricted").map((f) => f.rule), ["pod-security-restricted/run-as-non-root-user"]);
});

test("API server checks: probes, volume mounts, restart policies, Service ports, names, CronJob zones", () => {
  const rules = (o) => objectChecks(o).map((f) => f.rule);
  const spec = { containers: [{ name: "c", image: "x:1", resources: { requests: { cpu: "1" } }, readinessProbe: { httpGet: { port: 80 }, exec: { command: ["true"] } }, volumeMounts: [{ name: "data", mountPath: "/d" }] }] };
  assert.deepEqual(rules(deployment(spec)), ["invalid-probe", "unknown-volume"]);
  assert.deepEqual(rules(deployment({ ...spec, containers: [{ name: "c", image: "x:1", resources: { limits: { memory: "1Gi" } } }], restartPolicy: "Never" })), ["invalid-restart-policy"]);
  assert.deepEqual(rules({ apiVersion: "batch/v1", kind: "Job", metadata: { name: "j" }, spec: { template: { spec: { restartPolicy: "Never", containers: [{ name: "c", image: "x:1", resources: { requests: { cpu: "1" } } }] } } } }), []);
  const svc = { apiVersion: "v1", kind: "Service", metadata: { name: "1web" }, spec: { ports: [{ port: 80 }, { port: 70000, name: "b", nodePort: 80 }] } };
  assert.deepEqual(rules(svc), ["invalid-name", "unnamed-port", "invalid-port", "node-port-range"]);
  const cron = { apiVersion: "batch/v1", kind: "CronJob", metadata: { name: "c" }, spec: { schedule: "CRON_TZ=UTC 0 * * * *", timeZone: "Mars/Olympus", jobTemplate: { spec: { template: { spec: { restartPolicy: "OnFailure", containers: [{ name: "c", image: "x:1", resources: { requests: { cpu: "1" } } }] } } } } } };
  assert.deepEqual(rules(cron), ["invalid-schedule", "invalid-time-zone"]);
  assert.deepEqual(rules({ apiVersion: "rbac.authorization.k8s.io/v1", kind: "ClusterRole", metadata: { name: "system:aggregate-to-edit" } }), [], "RBAC names may contain ':'");
});

test("across objects: near-miss selectors only, named target ports, Ingress backends, duplicates", () => {
  const item = (obj, line = 1) => ({ obj, lineOf: () => line, line, file: "a.yaml" });
  const web = deployment({ containers: [{ name: "c", image: "x:1", ports: [{ name: "http", containerPort: 8080 }] }] }, { app: "a" });
  const svc = (sel, targetPort = "http", name = "s") => ({ apiVersion: "v1", kind: "Service", metadata: { name }, spec: { selector: sel, ports: [{ name: "p", port: 80, targetPort }] } });
  assert.deepEqual(crossChecks([item(web), item(svc({ app: "a" }))]), []);
  assert.deepEqual(crossChecks([item(web), item(svc({ app: "b" }))]).map((f) => f.rule), ["service-selects-nothing"]);
  assert.deepEqual(crossChecks([item(web), item(svc({ "operator.io/name": "prom" }))]), [], "pods made by an operator are not in the files");
  assert.deepEqual(crossChecks([item(web), item(svc({ app: "a" }, "metrics"))]).map((f) => f.rule), ["unknown-target-port"]);
  const ing = { apiVersion: "networking.k8s.io/v1", kind: "Ingress", metadata: { name: "i" }, spec: { rules: [{ http: { paths: [{ path: "/", pathType: "Prefix", backend: { service: { name: "s", port: { number: 81 } } } }, { path: "/x", pathType: "Prefix", backend: { service: { name: "gone", port: { number: 80 } } } }] } }] } };
  assert.deepEqual(crossChecks([item(web), item(svc({ app: "a" })), item(ing)]).map((f) => f.rule), ["unknown-service-port", "unknown-service"]);
  assert.deepEqual(crossChecks([item(svc({ app: "a" }), 1), item(svc({ app: "a" }), 9)]).map((f) => f.rule), ["duplicate-object"]);
});
