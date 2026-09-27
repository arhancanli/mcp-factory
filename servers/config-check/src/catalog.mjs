// src/catalog.mjs
//
// SchemaStore's catalog: 1,400+ JSON Schemas for configuration files, each with the file names it
// applies to (tsconfig*.json, **/.github/workflows/*.yml...). Schemas are fetched from the hosts the
// catalog lists and nowhere else: the fetcher's allowlist is built from the catalog itself.
import { createFetcher, TtlCache, ToolError } from "./kit/index.mjs";

const CATALOG = "https://www.schemastore.org/api/json/catalog.json";
const DAY = 86_400_000;

/** The URL a schema is fetched from and keyed by: HTTPS, fragment dropped, json.schemastore.org folded into www. */
export function canonicalUrl(u) {
  const x = new URL(u);
  x.hash = "";
  if (x.protocol === "http:") x.protocol = "https:";
  if (x.hostname === "json.schemastore.org") x.hostname = "www.schemastore.org";
  return x.href;
}

/** A SchemaStore fileMatch glob as a regular expression over a slash-separated path. */
export function globToRegex(glob) {
  const g = String(glob).replace(/\\/g, "/");
  let re = "";
  for (let i = 0; i < g.length; i++) {
    const ch = g[i];
    if (ch === "*" && g[i + 1] === "*" && g[i + 2] === "/") {
      re += "(?:.*/)?";
      i += 2;
    } else if (ch === "*" && g[i + 1] === "*") {
      re += ".*";
      i += 1;
    } else if (ch === "*") re += "[^/]*";
    else if (ch === "?") re += "[^/]";
    else if (ch === "{" && g.indexOf("}", i) > i) {
      const end = g.indexOf("}", i);
      re += `(?:${g
        .slice(i + 1, end)
        .split(",")
        .map((x) => x.replace(/[.+^$()|[\]\\*?]/g, "\\$&"))
        .join("|")})`;
      i = end;
    } else re += ch.replace(/[.+^$()|[\]\\{}]/g, "\\$&");
  }
  // A pattern without a slash matches the file name in any folder.
  return new RegExp(g.includes("/") ? `(?:^|/)${re.replace(/^\(\?:\.\*\/\)\?/, "")}$` : `(?:^|/)${re}$`, "i");
}

export async function catalog(ctx) {
  if (ctx.catalog && Date.now() - ctx.catalog.at < DAY) return ctx.catalog.value;
  ctx.catalogLoading ??= (async () => {
    const { data } = await ctx.fetcher.getJson(CATALOG);
    const schemas = (data.schemas ?? [])
      .filter((s) => typeof s.name === "string" && typeof s.url === "string")
      .map((s) => ({ name: s.name, description: s.description ?? "", url: s.url, fileMatch: s.fileMatch ?? [], matchers: (s.fileMatch ?? []).map(globToRegex) }));
    const hosts = new Set(["www.schemastore.org", "json.schemastore.org", "json-schema.org"]);
    const byUrl = new Map();
    for (const s of schemas) {
      try {
        hosts.add(new URL(s.url).hostname);
        byUrl.set(canonicalUrl(s.url), s);
      } catch {
        // an unparsable URL in the catalog is skipped
      }
    }
    const fetcher = createFetcher({ allowHosts: [...hosts], userAgent: ctx.userAgent, cache: new TtlCache({ ttlMs: DAY, maxEntries: 400 }), maxBytes: 8 * 1024 * 1024, timeoutMs: 20_000, attemptTimeoutMs: 8_000, fetchImpl: ctx.fetchImpl });
    return { schemas, hosts, byUrl, fetcher };
  })().finally(() => {
    ctx.catalogLoading = undefined;
  });
  const value = await ctx.catalogLoading;
  ctx.catalog = { at: Date.now(), value };
  return value;
}

/**
 * Catalog entries whose file patterns match a path, most specific first (the longest pattern that
 * matched: ".github/workflows/*.yml" beats "*.yml"). Entries tied for most specific come first.
 */
export function matchPath(c, path) {
  const p = String(path ?? "").replace(/\\/g, "/");
  const hits = [];
  for (const s of c.schemas) {
    let score = -1;
    s.matchers.forEach((m, i) => {
      if (m.test(p)) score = Math.max(score, s.fileMatch[i].replace(/\*\*\/|\*/g, "").length);
    });
    if (score >= 0) hits.push({ s, score });
  }
  hits.sort((a, b) => b.score - a.score);
  return hits;
}

/** The catalog entry for a schema name ("tsconfig", "GitHub Workflow"), a file name, or a schema URL. */
export async function schemaFor(ctx, schema) {
  const c = await catalog(ctx);
  const s = String(schema).trim();
  if (/^https?:\/\//i.test(s)) {
    let host;
    try {
      host = new URL(s).hostname;
    } catch {
      throw new ToolError("bad_schema_url", `"${s}" is not a URL.`);
    }
    if (!c.hosts.has(host)) throw new ToolError("schema_host_not_allowed", `${host} is not a host SchemaStore's catalog uses, so schemas are not fetched from it. Pass a SchemaStore schema name or URL.`);
    return c.byUrl.get(canonicalUrl(s)) ?? { name: s, url: s, description: "", fileMatch: [] };
  }
  const lower = s.toLowerCase();
  const exact = (n) => c.schemas.find((x) => x.name.toLowerCase() === n);
  const byPath = matchPath(c, s)[0]?.s;
  const partial = c.schemas.filter((x) => x.name.toLowerCase().includes(lower)).sort((a, b) => a.name.length - b.name.length)[0];
  const hit = exact(lower) ?? exact(`${lower}.json`) ?? byPath ?? partial;
  if (!hit) throw new ToolError("unknown_schema", `SchemaStore has no schema called "${s}". Use find_schema to search, or pass a file name (tsconfig.json) or a schema URL.`);
  return hit;
}
