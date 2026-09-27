// src/schema.mjs
//
// A version's definitions as one compiled schema. Three things are added to what the OpenAPI
// document says, each matching what the API server enforces:
// - Unknown fields are errors: kubectl (1.27 on) asks the server for strict field validation, so an
//   object with a misspelt field is refused. Every definition that lists its properties is closed,
//   unless it preserves unknown fields.
// - Enumerated fields: the OpenAPI document gives imagePullPolicy, restartPolicy, Service type and
//   the like as plain strings; the allowed values below are the ones the API server's validation
//   accepts, so "always" is refused with "Always" suggested.
// - Quantities: "1GB", "512mb" and "1K" are not quantities (1G, 512Mi, 1k are); the pattern is the
//   API machinery's grammar.
import Ajv from "ajv";
import { definitions } from "./versions.mjs";

// Definition -> property -> allowed values. For array properties the values apply to the items.
export const ENUMS = {
  "io.k8s.api.core.v1.Container": { imagePullPolicy: ["Always", "IfNotPresent", "Never"], terminationMessagePolicy: ["File", "FallbackToLogsOnError"] },
  "io.k8s.api.core.v1.EphemeralContainer": { imagePullPolicy: ["Always", "IfNotPresent", "Never"], terminationMessagePolicy: ["File", "FallbackToLogsOnError"] },
  "io.k8s.api.core.v1.ContainerPort": { protocol: ["TCP", "UDP", "SCTP"] },
  "io.k8s.api.core.v1.ServicePort": { protocol: ["TCP", "UDP", "SCTP"] },
  "io.k8s.api.core.v1.EndpointPort": { protocol: ["TCP", "UDP", "SCTP"] },
  "io.k8s.api.networking.v1.NetworkPolicyPort": { protocol: ["TCP", "UDP", "SCTP"] },
  "io.k8s.api.networking.v1.NetworkPolicySpec": { policyTypes: ["Ingress", "Egress"] },
  "io.k8s.api.core.v1.PodSpec": { restartPolicy: ["Always", "OnFailure", "Never"], dnsPolicy: ["ClusterFirst", "ClusterFirstWithHostNet", "Default", "None"], preemptionPolicy: ["PreemptLowerPriority", "Never"] },
  "io.k8s.api.core.v1.ServiceSpec": { type: ["ClusterIP", "NodePort", "LoadBalancer", "ExternalName"], sessionAffinity: ["None", "ClientIP"], externalTrafficPolicy: ["Cluster", "Local"], internalTrafficPolicy: ["Cluster", "Local"], ipFamilyPolicy: ["SingleStack", "PreferDualStack", "RequireDualStack"], ipFamilies: ["IPv4", "IPv6"] },
  "io.k8s.api.networking.v1.HTTPIngressPath": { pathType: ["Exact", "Prefix", "ImplementationSpecific"] },
  "io.k8s.api.apps.v1.DeploymentStrategy": { type: ["RollingUpdate", "Recreate"] },
  "io.k8s.api.apps.v1.StatefulSetSpec": { podManagementPolicy: ["OrderedReady", "Parallel"] },
  "io.k8s.api.apps.v1.StatefulSetUpdateStrategy": { type: ["RollingUpdate", "OnDelete"] },
  "io.k8s.api.apps.v1.DaemonSetUpdateStrategy": { type: ["RollingUpdate", "OnDelete"] },
  "io.k8s.api.batch.v1.CronJobSpec": { concurrencyPolicy: ["Allow", "Forbid", "Replace"] },
  "io.k8s.api.batch.v1.JobSpec": { completionMode: ["NonIndexed", "Indexed"], podReplacementPolicy: ["TerminatingOrFailed", "Failed"] },
  "io.k8s.api.core.v1.PersistentVolumeClaimSpec": { accessModes: ["ReadWriteOnce", "ReadOnlyMany", "ReadWriteMany", "ReadWriteOncePod"], volumeMode: ["Filesystem", "Block"] },
  "io.k8s.api.core.v1.PersistentVolumeSpec": { accessModes: ["ReadWriteOnce", "ReadOnlyMany", "ReadWriteMany", "ReadWriteOncePod"], volumeMode: ["Filesystem", "Block"], persistentVolumeReclaimPolicy: ["Retain", "Delete", "Recycle"] },
  "io.k8s.api.core.v1.Toleration": { operator: ["Exists", "Equal"], effect: ["NoSchedule", "PreferNoSchedule", "NoExecute"] },
  "io.k8s.api.core.v1.Taint": { effect: ["NoSchedule", "PreferNoSchedule", "NoExecute"] },
  "io.k8s.api.core.v1.NodeSelectorRequirement": { operator: ["In", "NotIn", "Exists", "DoesNotExist", "Gt", "Lt"] },
  "io.k8s.apimachinery.pkg.apis.meta.v1.LabelSelectorRequirement": { operator: ["In", "NotIn", "Exists", "DoesNotExist"] },
  "io.k8s.api.core.v1.SeccompProfile": { type: ["RuntimeDefault", "Unconfined", "Localhost"] },
  "io.k8s.api.core.v1.AppArmorProfile": { type: ["RuntimeDefault", "Unconfined", "Localhost"] },
  "io.k8s.api.core.v1.HTTPGetAction": { scheme: ["HTTP", "HTTPS"] },
  "io.k8s.api.autoscaling.v2.MetricSpec": { type: ["Resource", "Pods", "Object", "External", "ContainerResource"] },
  "io.k8s.api.autoscaling.v2.MetricTarget": { type: ["Utilization", "Value", "AverageValue"] },
  "io.k8s.api.policy.v1.PodDisruptionBudgetSpec": { unhealthyPodEvictionPolicy: ["IfHealthyBudget", "AlwaysAllow"] },
};

// resource.Quantity: a number, then a binary (Ki..Ei), decimal (n u m k M G T P E) or exponent suffix.
export const QUANTITY = "^[+-]?(?:[0-9]+(?:\\.[0-9]*)?|\\.[0-9]+)(?:[KMGTPE]i|[numkMGTPE]|[eE][+-]?[0-9]+)?$";
const QUANTITY_DEF = "io.k8s.apimachinery.pkg.api.resource.Quantity";

// Close every object schema that lists its properties, as strict field validation does. Not inside
// allOf, anyOf, oneOf or not: a branch there lists only the properties it constrains (Cilium's
// "endpointSelector or nodeSelector"), and closing it would refuse the others.
const COMBINATORS = new Set(["allOf", "anyOf", "oneOf", "not"]);
export function closeObjects(node) {
  if (Array.isArray(node)) {
    for (const x of node) closeObjects(x);
    return;
  }
  if (!node || typeof node !== "object") return;
  if (node.properties && typeof node.properties === "object" && node.additionalProperties === undefined && !node["x-kubernetes-preserve-unknown-fields"]) node.additionalProperties = false;
  for (const [k, v] of Object.entries(node)) if (k !== "enum" && k !== "default" && k !== "example" && !COMBINATORS.has(k)) closeObjects(v);
}

/** A definitions document as the API server validates it (see the header). */
export function prepare(doc) {
  const copy = structuredClone(doc);
  delete copy.$schema;
  const defs = copy.definitions ?? {};
  for (const [name, props] of Object.entries(ENUMS)) {
    for (const [prop, values] of Object.entries(props)) {
      const p = defs[name]?.properties?.[prop];
      if (!p) continue;
      if (p.type === "array" || (Array.isArray(p.type) && p.type.includes("array"))) {
        if (p.items && typeof p.items === "object" && !p.items.$ref) p.items.enum = values;
      } else if (!p.$ref) p.enum = [...values, ...(Array.isArray(p.type) && p.type.includes("null") ? [null] : [])];
    }
  }
  const q = defs[QUANTITY_DEF];
  for (const branch of q?.oneOf ?? q?.anyOf ?? []) if (branch.type === "string") branch.pattern = QUANTITY;
  if (q?.type === "string") q.pattern = QUANTITY;
  closeObjects(defs);
  return copy;
}

// Kubernetes and its operators write patterns for Go's RE2: "(?i)" flags, \z, [[:alpha:]]. They are
// translated to JavaScript; a pattern that still cannot run is not checked rather than making the
// whole schema unusable.
const POSIX = { alpha: "A-Za-z", digit: "0-9", alnum: "A-Za-z0-9", upper: "A-Z", lower: "a-z", space: "\\s", xdigit: "0-9A-Fa-f", word: "\\w" };
export function goRegExp(pattern, flags = "") {
  let p = String(pattern);
  let f = flags;
  // Flags written inline ("^(?i)(abort|warn)$"): JavaScript takes them for the whole pattern.
  const inline = [...p.matchAll(/\(\?([imsU]+)\)/g)].map((m) => m[1]).join("");
  if (inline) {
    p = p.replace(/\(\?[imsU]+\)/g, "");
    if (inline.includes("i")) f += "i";
    if (inline.includes("s")) f += "s";
  }
  p = p
    .replace(/\\z/g, "$")
    .replace(/\\A/g, "^")
    .replace(/\[:(\w+):\]/g, (all, c) => POSIX[c] ?? all);
  for (const fl of [f, f.replace("u", "")]) {
    try {
      return new RegExp(p, fl);
    } catch {
      // try without Unicode mode
    }
  }
  return { test: () => true };
}

export function newAjv({ unicodeRegExp = true } = {}) {
  const ajv = new Ajv({ strict: false, allErrors: true, verbose: true, logger: false, validateSchema: false, allowUnionTypes: true, unicodeRegExp, code: { regExp: goRegExp } });
  // Secret data is base64; int32 fields are 32-bit integers.
  ajv.addFormat("byte", /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/);
  ajv.addFormat("int32", { type: "number", validate: (n) => Number.isInteger(n) && n >= -(2 ** 31) && n < 2 ** 31 });
  for (const f of ["int64", "double", "date-time", "date", "duration", "email", "uri"]) ajv.addFormat(f, true);
  return ajv;
}

/** A version's compiled schema: a validation tree per definition, on demand. */
export async function compiledVersion(ctx, minor) {
  ctx.compiledVersions ??= new Map();
  if (!ctx.compiledVersions.has(minor)) {
    const promise = (async () => {
      const defs = await definitions(ctx, minor);
      if (!defs) return null;
      const key = `k8s-1.${minor}`;
      const doc = prepare(defs.doc);
      const ajv = newAjv();
      ajv.addSchema(doc, key);
      const trees = new Map();
      // The explainer indexes every schema object by document once; all kinds share one index.
      const shared = {};
      const treeFor = (name) => {
        if (!trees.has(name)) {
          const s = doc.definitions[name];
          const tree = s ? { url: key, docs: new Map([[key, doc]]), root: { s, doc: key }, validate: ajv.getSchema(`${key}#/definitions/${name}`) } : null;
          if (tree)
            Object.defineProperty(tree, "objDoc", {
              get: () => shared.objDoc,
              set: (v) => {
                shared.objDoc = v;
              },
            });
          trees.set(name, tree);
        }
        return trees.get(name);
      };
      return { minor, key, doc, defs, treeFor };
    })();
    ctx.compiledVersions.set(minor, promise);
    promise.catch(() => ctx.compiledVersions.delete(minor));
    while (ctx.compiledVersions.size > 4) ctx.compiledVersions.delete(ctx.compiledVersions.keys().next().value);
  }
  return ctx.compiledVersions.get(minor);
}
