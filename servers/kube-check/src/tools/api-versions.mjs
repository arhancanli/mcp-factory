import { z } from "zod";
import { compact, defineTool } from "../kit/index.mjs";
import { nearest } from "../explain.mjs";
import { compiledVersion } from "../schema.mjs";
import { deprecations, INSTEAD } from "../sources.mjs";
import { resolveVersion, splitApiVersion } from "../versions.mjs";
import { READ_ONLY } from "./shared.mjs";

/** "Ingress", "networking.k8s.io/v1beta1/Ingress", "extensions/v1beta1 Ingress" -> {apiVersion?, kind}. */
export function parseKindQuery(q) {
  const s = String(q).trim();
  const spaced = s.match(/^(\S+)\s+(\S+)$/);
  if (spaced) return { apiVersion: spaced[1], kind: spaced[2] };
  const i = s.lastIndexOf("/");
  if (i > 0 && /^[A-Z]/.test(s.slice(i + 1))) return { apiVersion: s.slice(0, i), kind: s.slice(i + 1) };
  return { kind: s };
}

export const apiVersions = defineTool({
  name: "api_versions",
  title: "Which apiVersion does a kind need?",
  description: "For Kubernetes kinds (Ingress) or apiVersion/kind pairs (batch/v1beta1/CronJob): the apiVersions a version serves (default: newest), the one to use, and when older ones were deprecated and removed. A named apiVersion gets its status there: served, deprecated or removed, with the replacement.",
  input: {
    kinds: z.array(z.string().min(1).max(120)).min(1).max(50),
    kubernetes_version: z.string().max(20).optional(),
  },
  output: { kubernetes_version: z.string(), results: z.array(z.looseObject({ query: z.string() })) },
  annotations: READ_ONLY,
  handler: async ({ kinds, kubernetes_version }, ctx) => {
    const plutoLoading = deprecations(ctx);
    plutoLoading.catch(() => {});
    const { minor, note } = await resolveVersion(ctx, kubernetes_version);
    const [ver, pluto] = await Promise.all([compiledVersion(ctx, minor), plutoLoading]);
    const allKinds = [...ver.defs.byKind.keys()];
    const results = kinds.map((query) => {
      const { apiVersion, kind: raw } = parseKindQuery(query);
      // Kinds are case-sensitive in manifests; accept "ingress" here and say the right spelling.
      const kind = ver.defs.byKind.has(raw) ? raw : (allKinds.find((k) => k.toLowerCase() === raw.toLowerCase()) ?? raw);
      const served = ver.defs.byKind.get(kind) ?? [];
      const history = [...pluto.values()]
        .filter((d) => d.kind === kind && d.component === "k8s")
        .map((d) => compact({ apiVersion: d.apiVersion, deprecated_in: d.deprecatedIn ? `1.${d.deprecatedIn}` : undefined, removed_in: d.removedIn ? `1.${d.removedIn}` : undefined, replacement: d.replacement }));
      const row = { query, kind, served: served.map((e) => e.apiVersion) };
      if (served.length) row.use = served[0].apiVersion;
      if (history.length) row.history = history;
      if (apiVersion) {
        const dep = pluto.get(`${apiVersion}/${kind}`);
        const isServed = served.some((e) => e.apiVersion === apiVersion);
        const newer = served.find((e) => e.apiVersion !== apiVersion && splitApiVersion(e.apiVersion).version !== splitApiVersion(apiVersion).version);
        if (isServed) row.status = dep?.deprecatedIn !== undefined && dep.deprecatedIn <= minor && newer ? `deprecated since 1.${dep.deprecatedIn}${dep.removedIn ? `, removed in 1.${dep.removedIn}` : ""}` : "served";
        else if (dep?.removedIn !== undefined && dep.removedIn <= minor) row.status = `removed in 1.${dep.removedIn}`;
        else row.status = served.length ? "not served in this version" : "not served";
      }
      if (!served.length) {
        // The kind's last removal (PodSecurityPolicy: extensions/v1beta1 in 1.16, then policy/v1beta1 in 1.25).
        const gone = history.filter((h) => h.removed_in).sort((a, b) => Number(b.removed_in.split(".")[1]) - Number(a.removed_in.split(".")[1]))[0];
        if (gone) row.note = INSTEAD[kind] ? `Removed in ${gone.removed_in} with no replacement API; use ${INSTEAD[kind]}.` : `Removed in ${gone.removed_in}.`;
        else {
          const guess = nearest(raw, allKinds);
          row.note = `Kubernetes 1.${minor} has no built-in kind ${raw}${guess ? `; did you mean ${guess}?` : "; if it is a custom resource, its CRD defines it."}`;
        }
      }
      return row;
    });
    return { kubernetes_version: `1.${minor}`, ...(note ? { note } : {}), results };
  },
});
