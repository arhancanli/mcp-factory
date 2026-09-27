// src/sources.mjs
//
// The two data sets beside the API definitions:
// - Pluto's table of deprecated and removed API versions (github.com/FairwindsOps/pluto,
//   Apache-2.0): when an apiVersion was deprecated and removed, and what replaces it, for
//   Kubernetes and for cert-manager and Istio. Whether a version is served at all is read from the
//   version's own definitions, not from this table.
// - Custom resource schemas from the CRDs catalog (github.com/datreeio/CRDs-catalog, MIT): one
//   JSON Schema per group, kind and version, the ones kubeconform users point at. A
//   CustomResourceDefinition in the checked files is used before the catalog.
import { UpstreamError } from "./kit/index.mjs";
import { closeObjects, newAjv } from "./schema.mjs";

const PLUTO = "https://raw.githubusercontent.com/FairwindsOps/pluto/master/versions.yaml";
const CATALOG = "https://raw.githubusercontent.com/datreeio/CRDs-catalog/main";
const DAY = 86_400_000;

// Removed APIs with no replacement API: what to use instead.
export const INSTEAD = {
  PodSecurityPolicy: "Pod Security admission: label the namespace with pod-security.kubernetes.io/enforce (baseline or restricted), or use a policy engine such as Kyverno or Gatekeeper",
};

const minorOf = (v) => {
  const m = String(v ?? "").match(/^v?1\.(\d+)/);
  return m ? Number(m[1]) : undefined;
};

/** Pluto's entries, keyed "apiVersion/Kind". */
export async function deprecations(ctx) {
  if (ctx.pluto && Date.now() - ctx.pluto.at < DAY) return ctx.pluto.value;
  ctx.plutoLoading ??= (async () => {
    const { parse } = await import("yaml");
    const res = await ctx.fetcher.request(PLUTO, { accept: "text/plain, */*" });
    if (!res.ok) throw new UpstreamError("upstream_status", `raw.githubusercontent.com answered with status ${res.status} for Pluto's deprecation table.`, { status: res.status });
    const out = new Map();
    for (const e of parse(res.text)?.["deprecated-versions"] ?? []) {
      if (!e?.version || !e?.kind) continue;
      const k8s = e.component === "k8s";
      out.set(`${e.version}/${e.kind}`, {
        apiVersion: e.version,
        kind: e.kind,
        component: e.component,
        deprecatedIn: k8s ? minorOf(e["deprecated-in"]) : e["deprecated-in"] || undefined,
        removedIn: k8s ? minorOf(e["removed-in"]) : e["removed-in"] || undefined,
        replacement: e["replacement-api"] || undefined,
        replacementSince: k8s ? minorOf(e["replacement-available-in"]) : e["replacement-available-in"] || undefined,
      });
    }
    return out;
  })().finally(() => {
    ctx.plutoLoading = undefined;
  });
  const value = await ctx.plutoLoading;
  ctx.pluto = { at: Date.now(), value };
  return value;
}

function crTree(key, schema, catalog) {
  const doc = structuredClone(schema);
  delete doc.$schema;
  // The API server gives every custom resource apiVersion, kind and the standard metadata (checked
  // separately); a CRD's schema usually leaves them out.
  if (doc.properties && typeof doc.properties === "object") doc.properties = { ...doc.properties, apiVersion: { type: "string" }, kind: { type: "string" }, metadata: { type: "object" } };
  closeObjects(doc);
  // Some operators' schemas carry patterns that are valid JavaScript but not in Unicode mode.
  for (const unicodeRegExp of [true, false]) {
    try {
      return { url: key, docs: new Map([[key, doc]]), validate: newAjv({ unicodeRegExp }).compile(doc), catalog };
    } catch {
      // try the other mode, then give up on this schema
    }
  }
  return null;
}

/** CustomResourceDefinitions among the checked objects, keyed "group/version/Kind". */
export function definedHere(objects) {
  const out = new Map();
  for (const { obj } of objects) {
    if (obj.kind !== "CustomResourceDefinition" || !String(obj.apiVersion).startsWith("apiextensions.k8s.io/")) continue;
    const group = obj.spec?.group;
    const kind = obj.spec?.names?.kind;
    for (const v of obj.spec?.versions ?? []) {
      const schema = v?.schema?.openAPIV3Schema ?? obj.spec?.validation?.openAPIV3Schema;
      if (group && kind && v?.name && schema && typeof schema === "object") out.set(`${group}/${v.name}/${kind}`, { schema, served: v.served !== false });
    }
  }
  return out;
}

/** The schema tree for a custom resource: from a CRD in the files, else the catalog, else null. */
export async function customResourceTree(ctx, here, group, version, kind) {
  const own = here.get(`${group}/${version}/${kind}`);
  if (own) return crTree(`crd:${group}/${version}/${kind}`, own.schema, false);
  ctx.crTrees ??= new Map();
  const url = `${CATALOG}/${group}/${kind.toLowerCase()}_${version}.json`;
  if (!ctx.crTrees.has(url)) {
    const p = ctx.fetcher.getJson(url, { allowStatus: [404] }).then(({ status, data }) => (status === 404 || !data || typeof data !== "object" ? null : crTree(url, data, true)));
    ctx.crTrees.set(url, p);
    p.catch(() => ctx.crTrees.delete(url));
    while (ctx.crTrees.size > 60) ctx.crTrees.delete(ctx.crTrees.keys().next().value);
  }
  return ctx.crTrees.get(url);
}
