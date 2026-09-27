// Golden tests: the three tools over a real MCP client, replaying the API definitions of 1.24, 1.25
// and 1.37, Pluto's deprecation table, the release list and a CRD schema, as recorded by
// test/record.mjs. No test here touches the network.
import assert from "node:assert/strict";
import test from "node:test";
import { call, connect } from "./replay.mjs";
import { BROKEN, CLEAN, CUSTOM, UPGRADE } from "./scenarios.mjs";

const brief = (f) => `${f.severity} ${f.line} ${f.rule} ${f.path ?? ""}`;

test("check_manifests: every mistake in the broken manifests, with its line, rule and fix", async () => {
  const client = await connect();
  const { data } = await call(client, "check_manifests", { files: [{ path: "k8s/app.yaml", content: BROKEN }] });
  assert.deepEqual([data.kubernetes_version, data.objects, data.counts], ["1.37", 5, { error: 12, warning: 5 }]);
  assert.deepEqual(data.findings.map(brief), [
    "error 4 invalid-name metadata.name",
    "error 9 selector-mismatch spec.selector",
    "error 20 schema spec.template.spec.containers[0].imagePullPolicy",
    "error 21 schema spec.template.spec.containers[0].port",
    "error 25 schema spec.template.spec.containers[0].resources.requests.memory",
    "error 26 request-above-limit spec.template.spec.containers[0].resources.requests.cpu",
    "error 33 schema spec.template.spec.containers[0].env[1].value",
    "error 37 removed-api apiVersion",
    "error 62 removed-api apiVersion",
    "error 67 invalid-schedule spec.schedule",
    "error 71 invalid-restart-policy spec.jobTemplate.spec.template.spec",
    "error 76 removed-api apiVersion",
    "warning 19 unpinned-image spec.template.spec.containers[0].image",
    "warning 31 secret-in-env spec.template.spec.containers[0].env[0].value",
    "warning 35 pod-security-baseline/privileged spec.template.spec.containers[0].securityContext.privileged",
    "warning 56 service-selects-nothing spec.selector",
    "warning 73 no-resources spec.jobTemplate.spec.template.spec.containers[0]",
  ]);
  const at = (line) => data.findings.find((f) => f.line === line);
  assert.deepEqual([at(20).did_you_mean, at(20).allowed], ["Always", ["Always", "IfNotPresent", "Never"]], "enum values the OpenAPI document does not list");
  assert.equal(at(21).did_you_mean, "ports");
  assert.deepEqual([at(25).did_you_mean, at(25).message.startsWith('"512mb" is not a quantity: write 512Mi')], ["512Mi", true]);
  assert.match(at(33).message, /must be string, not boolean \(quote the value in YAML\)/, "YAML 1.1, as kubectl reads it: yes is a boolean");
  assert.equal(at(37).message, "extensions/v1beta1 Ingress was removed in Kubernetes 1.22; use networking.k8s.io/v1.");
  assert.deepEqual(at(37).after_migration, [
    'line 46: spec.rules[0].http.paths[0]: missing required property "pathType"',
    'line 48: spec.rules[0].http.paths[0].backend.serviceName: unknown property "serviceName" (did you mean service?)',
    'line 49: spec.rules[0].http.paths[0].backend.servicePort: unknown property "servicePort" (did you mean service?)',
  ]);
  assert.match(at(76).fix, /^Pod Security admission/);
  assert.match(at(56).message, /but Deployment "Web_App"'s pods have app=website/);
});

test("check_manifests: a production-grade Deployment, Service and Ingress pass, even under restricted", async () => {
  const client = await connect();
  const { data } = await call(client, "check_manifests", { files: [{ path: "k8s/api.yaml", content: CLEAN }], pod_security: "restricted" });
  assert.deepEqual([data.objects, data.counts, data.findings], [3, {}, []]);
});

test("check_manifests: a CRD's own resources, a catalogued custom resource, and restricted Pod Security", async () => {
  const client = await connect();
  const { data } = await call(client, "check_manifests", { files: [{ path: "k8s/custom.yaml", content: CUSTOM }], pod_security: "restricted" });
  assert.deepEqual(data.findings.map((f) => `${f.line} ${f.object} ${f.rule} ${f.did_you_mean ?? ""}`.trim()), [
    "29 Widget/w1 schema",
    "30 Widget/w1 schema color",
    "42 Certificate/site schema duration",
    "50 Pod/p pod-security-baseline/host-namespaces",
    "57 Pod/p pod-security-restricted/privilege-escalation",
    "57 Pod/p pod-security-restricted/seccomp",
    "57 Pod/p pod-security-restricted/capabilities",
    "58 Pod/p pod-security-baseline/capabilities",
    "58 Pod/p pod-security-restricted/capabilities",
    "43 Certificate/site schema",
  ]);
  assert.deepEqual(
    data.findings.filter((f) => f.severity !== "error").map((f) => f.path),
    ["spec.renewalWindowHours"],
    "a field the catalog's (possibly older) schema lacks, with no near match, is a warning; everything else is an error",
  );
  assert.match(data.findings.find((f) => f.path === "spec.renewalWindowHours").message, /CRDs catalog's schema for Certificate cert-manager\.io\/v1; if your installed CRD is newer, it may be valid$/);
  assert.equal(data.findings[0].message, "must be >= 1", "the CRD in the same file supplies the schema");
});

test("check_manifests: an upgrade to 1.25 breaks what 1.24 only deprecated", async () => {
  const client = await connect();
  const before = await call(client, "check_manifests", { files: [{ path: "k8s/legacy.yaml", content: UPGRADE }], kubernetes_version: "1.24" });
  assert.deepEqual(before.data.findings.map((f) => `${f.severity} ${f.message}`), [
    "warning batch/v1beta1 CronJob is deprecated since Kubernetes 1.21 and removed in 1.25.",
    "warning policy/v1beta1 PodDisruptionBudget is deprecated since Kubernetes 1.21 and removed in 1.25.",
  ]);
  assert.match(before.data.note, /1\.24 reached its upstream end of life on 2023-07-28/);
  const after = await call(client, "check_manifests", { files: [{ path: "k8s/legacy.yaml", content: UPGRADE }], kubernetes_version: "v1.25.3" });
  assert.deepEqual(after.data.findings.map((f) => `${f.severity} ${f.line} ${f.fix}`), ["error 1 apiVersion: batch/v1", "error 18 apiVersion: policy/v1"]);
});

test("api_versions: what each kind needs, when old versions went, and kinds that do not exist", async () => {
  const client = await connect();
  const { data } = await call(client, "api_versions", { kinds: ["Ingress", "extensions/v1beta1 Ingress", "PodSecurityPolicy", "batch/v1beta1/CronJob", "horizontalpodautoscaler", "Deploymnet"] });
  const [ing, old, psp, cron, hpa, typo] = data.results;
  assert.deepEqual([ing.use, ing.history.map((h) => `${h.apiVersion} ${h.removed_in}`)], ["networking.k8s.io/v1", ["extensions/v1beta1 1.22", "networking.k8s.io/v1beta1 1.22"]]);
  assert.equal(old.status, "removed in 1.22");
  assert.match(psp.note, /^Removed in 1\.25 with no replacement API; use Pod Security admission/);
  assert.equal(cron.status, "removed in 1.25");
  assert.deepEqual([hpa.kind, hpa.served], ["HorizontalPodAutoscaler", ["autoscaling/v2", "autoscaling/v1"]]);
  assert.equal(typo.note, "Kubernetes 1.37 has no built-in kind Deploymnet; did you mean Deployment?");
});

test("field_help: a field's meaning and type, search by words, and a misspelt path refused with the fix", async () => {
  const client = await connect();
  const surge = await call(client, "field_help", { kind: "Deployment", field: "spec.strategy.rollingUpdate.maxSurge" });
  assert.deepEqual([surge.data.apiVersion, surge.data.type], ["apps/v1", ["string", "integer"]]);
  assert.match(surge.data.description, /Defaults to 25%/);
  const found = await call(client, "field_help", { kind: "Pod", search: "termination grace" });
  assert.equal(found.data.matches[0].field, "spec.terminationGracePeriodSeconds");
  const typo = await call(client, "field_help", { kind: "apps/v1/Deployment", field: "spec.template.spec.containers[].resource" });
  assert.equal(typo.res.isError, true);
  assert.match(typo.res.content[0].text, /Did you mean spec\.template\.spec\.containers\[\]\.resources\?/);
});
