// src/versions.mjs
//
// Which Kubernetes versions can be checked, and what each one serves. The API of a minor version
// comes from the JSON Schemas generated from Kubernetes' own OpenAPI document
// (github.com/yannh/kubernetes-json-schema, the schemas kubeconform uses): one _definitions.json
// per version, which also lists the group, version and kind of every API the version serves. The
// newest release comes from endoflife.date.
import { ToolError } from "./kit/index.mjs";

export const OLDEST = 19;
const SCHEMAS = "https://raw.githubusercontent.com/yannh/kubernetes-json-schema/master";
const RELEASES = "https://endoflife.date/api/v1/products/kubernetes";
const HOUR = 3_600_000;

export const definitionsUrl = (minor) => `${SCHEMAS}/v1.${minor}.0/_definitions.json`;

/** "1.29", "v1.29.3", "1.29.0" -> 29. */
export function parseVersion(v) {
  const m = String(v ?? "")
    .trim()
    .match(/^v?1\.(\d{1,2})(?:\.\d+)?$/);
  return m ? Number(m[1]) : undefined;
}

/** apiVersion "apps/v1" -> {group: "apps", version: "v1"}; "v1" -> {group: "", version: "v1"}. */
export function splitApiVersion(apiVersion) {
  const s = String(apiVersion ?? "");
  const i = s.lastIndexOf("/");
  return i < 0 ? { group: "", version: s } : { group: s.slice(0, i), version: s.slice(i + 1) };
}

export const joinApiVersion = (group, version) => (group ? `${group}/${version}` : version);

// Stable before beta before alpha, then the higher number: v1 > v1beta3 > v1beta1 > v1alpha1.
export function versionRank(v) {
  const m = String(v).match(/^v(\d+)(?:(alpha|beta)(\d+))?$/);
  if (!m) return -1;
  const stage = m[2] === "alpha" ? 0 : m[2] === "beta" ? 1 : 2;
  return Number(m[1]) * 1000 + stage * 100 + (m[3] ? Number(m[3]) : 0);
}

async function releases(ctx) {
  if (ctx.releases && Date.now() - ctx.releases.at < 12 * HOUR) return ctx.releases.value;
  const { data } = await ctx.fetcher.getJson(RELEASES);
  const value = new Map(
    (data?.result?.releases ?? [])
      .map((r) => [parseVersion(r.name), { latest: r.latest?.name, eol: r.eolFrom, isEol: r.isEol }])
      .filter(([m]) => m !== undefined),
  );
  ctx.releases = { at: Date.now(), value };
  return value;
}

/** The definitions of a minor version, with an index of the kinds it serves. */
export async function definitions(ctx, minor) {
  ctx.definitions ??= new Map();
  const hit = ctx.definitions.get(minor);
  if (hit && Date.now() - hit.at < 24 * HOUR) return hit.promise;
  const promise = (async () => {
    const { status, data } = await ctx.fetcher.getJson(definitionsUrl(minor), { allowStatus: [404] });
    if (status === 404) return null;
    const byGvk = new Map();
    const byKind = new Map();
    for (const [name, def] of Object.entries(data.definitions ?? {})) {
      for (const g of def["x-kubernetes-group-version-kind"] ?? []) {
        if (/List$/.test(g.kind) && g.kind !== "List") continue;
        const entry = { group: g.group ?? "", version: g.version, kind: g.kind, apiVersion: joinApiVersion(g.group, g.version), def: name };
        // Some definitions (DeleteOptions, WatchEvent) are listed under every group; keep the
        // definitions that belong to their own group.
        if (!name.includes(`.${entry.version}.${g.kind}`)) continue;
        byGvk.set(`${entry.apiVersion}/${g.kind}`, entry);
        if (!byKind.has(g.kind)) byKind.set(g.kind, []);
        byKind.get(g.kind).push(entry);
      }
    }
    for (const list of byKind.values()) list.sort((a, b) => versionRank(b.version) - versionRank(a.version));
    return { minor, doc: data, byGvk, byKind };
  })();
  ctx.definitions.set(minor, { at: Date.now(), promise });
  promise.catch(() => ctx.definitions.delete(minor));
  while (ctx.definitions.size > 6) ctx.definitions.delete(ctx.definitions.keys().next().value);
  return promise;
}

/** The newest minor version that is released and has schemas. */
export async function newestMinor(ctx) {
  if (ctx.newest && Date.now() - ctx.newest.at < 12 * HOUR) return ctx.newest.value;
  const known = [...(await releases(ctx)).keys()];
  let minor = Math.max(...known);
  // Schemas appear a few days after a release: fall back to the previous minor meanwhile.
  for (let i = 0; i < 3 && minor > OLDEST; i++, minor--) if (await definitions(ctx, minor)) break;
  ctx.newest = { at: Date.now(), value: minor };
  return minor;
}

/** The minor version to check against, and a note when that version is past its upstream end of life. */
export async function resolveVersion(ctx, input) {
  if (input === undefined || input === null || String(input).trim() === "") {
    const newest = await newestMinor(ctx);
    return { minor: newest, newest };
  }
  const minor = parseVersion(input);
  if (minor === undefined) throw new ToolError("bad_version", `"${String(input).slice(0, 40)}" is not a Kubernetes version. Give it as 1.30 or v1.30.2.`);
  if (minor < OLDEST) throw new ToolError("version_too_old", `Schemas are available from Kubernetes 1.${OLDEST}; 1.${minor} is older.`);
  // The release list and the asked-for version's definitions at once; the newest version's
  // definitions are not needed to check an older one.
  const [list, defs] = await Promise.all([releases(ctx), definitions(ctx, minor).catch((err) => err)]);
  const newest = Math.max(...list.keys());
  if (minor > newest) throw new ToolError("version_not_released", `Kubernetes 1.${minor} is not released yet; the newest is 1.${newest}.`);
  if (defs instanceof Error) throw defs;
  if (!defs) throw new ToolError("version_not_published", `The schemas for Kubernetes 1.${minor} are not published yet; try 1.${minor - 1}.`);
  const r = list.get(minor);
  const note = r?.isEol ? `Kubernetes 1.${minor} reached its upstream end of life${r.eol ? ` on ${r.eol}` : ""}; the newest release is 1.${newest}.` : undefined;
  return { minor, newest, note };
}
