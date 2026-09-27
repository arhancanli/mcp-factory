// src/eol.mjs
//
// Support status from endoflife.date (API v1, no key). For each product it publishes release
// cycles ("3.8", "18", "20.04") with their release, end-of-active-support, end-of-life and
// extended-support dates, LTS flags and latest patch. A version is matched to the longest cycle
// name that prefixes it at a dot boundary ("3.8.10" -> "3.8", "18.19.0" -> "18").
import { ToolError } from "./kit/index.mjs";

export const API = "https://endoflife.date/api/v1";
const DAY = 86_400_000;

/** endoflife.date product names by the other names people and images use. */
const EXTRA_ALIASES = {
  node: "nodejs", "node.js": "nodejs", golang: "go", postgres: "postgresql", pg: "postgresql", mongo: "mongodb", py: "python", python3: "python",
  "eclipse-temurin": "eclipse-temurin", openjdk: "eclipse-temurin", jdk: "eclipse-temurin", java: "eclipse-temurin", dotnet: "dotnet", ".net": "dotnet", k8s: "kubernetes", rails: "rails", "ruby-on-rails": "rails", ror: "rails",
  mysql: "mysql", mariadb: "mariadb", redis: "redis", nginx: "nginx", alpine: "alpine-linux", "alpine-linux": "alpine-linux", ubuntu: "ubuntu", debian: "debian", centos: "centos", rhel: "rhel", "amazon-linux": "amazon-linux", terraform: "terraform",
};

export async function productIndex(ctx) {
  const { data } = await ctx.fetcher.getJson(`${API}/products`);
  const byName = new Map();
  for (const p of data?.result ?? []) {
    byName.set(p.name, p.name);
    for (const a of p.aliases ?? []) if (!byName.has(a)) byName.set(a, p.name);
  }
  for (const [alias, name] of Object.entries(EXTRA_ALIASES)) if (!byName.has(alias) && byName.has(name)) byName.set(alias, name);
  return byName;
}

export const normProduct = (s) => String(s ?? "").trim().toLowerCase().replace(/\s+/g, "-");

export async function resolveProduct(ctx, raw) {
  const idx = await productIndex(ctx);
  const key = normProduct(raw);
  const hit = idx.get(key) ?? idx.get(key.replace(/-?\d+(\.\d+)*$/, ""));
  if (hit) return hit;
  const near = [...idx.keys()].filter((k) => k.startsWith(key.slice(0, 3))).slice(0, 8);
  throw new ToolError("unknown_product", `endoflife.date has no product "${raw}".${near.length ? ` Close names: ${near.join(", ")}.` : ""}`, near.length ? { candidates: near } : undefined);
}

export async function productReleases(ctx, name) {
  const { status, data } = await ctx.fetcher.getJson(`${API}/products/${encodeURIComponent(name)}`, { allowStatus: [404] });
  if (status === 404) throw new ToolError("unknown_product", `endoflife.date has no product "${name}".`);
  return { name: data.result.name, label: data.result.label, releases: data.result.releases ?? [], link: `https://endoflife.date/${data.result.name}` };
}

/** The release cycle a version belongs to: the longest cycle name that prefixes it at a dot boundary. */
export function matchCycle(releases, version) {
  const v = String(version ?? "").trim().replace(/^v/i, "");
  if (!v) return undefined;
  let best;
  for (const r of releases) {
    const n = String(r.name);
    if (v === n || v.startsWith(`${n}.`) || v.startsWith(`${n}-`)) if (!best || n.length > String(best.name).length) best = r;
  }
  return best;
}

const past = (date, now) => Boolean(date) && Date.parse(date) <= now;

/**
 * Status on a given day, from the dates (flags in the data are snapshots; dates are not).
 *   upcoming       not released yet
 *   supported      active support
 *   security_only  active support ended; security fixes continue
 *   extended_only  end of life for most users; paid extended support continues
 *   end_of_life    no fixes of any kind
 */
export function statusOf(r, now) {
  if (r.releaseDate && !past(r.releaseDate, now)) return "upcoming";
  const eol = r.eolFrom ? past(r.eolFrom, now) : Boolean(r.isEol);
  if (eol) return r.eoesFrom && !past(r.eoesFrom, now) ? "extended_only" : "end_of_life";
  const eoas = r.eoasFrom ? past(r.eoasFrom, now) : Boolean(r.isEoas);
  return eoas ? "security_only" : "supported";
}

export const daysUntil = (date, now) => (date ? Math.ceil((Date.parse(date) - now) / DAY) : undefined);

/** Where to upgrade: the newest released, supported cycle, an LTS one when the product has LTS releases. */
export function upgradeTarget(releases, now) {
  const live = releases.filter((r) => ["supported", "security_only"].includes(statusOf(r, now)));
  const hasLts = releases.some((r) => r.isLts || r.ltsFrom);
  const pool = hasLts ? live.filter((r) => r.isLts || (r.ltsFrom && past(r.ltsFrom, now))) : live;
  const pick = (pool.length ? pool : live).sort((a, b) => String(b.releaseDate).localeCompare(String(a.releaseDate)))[0];
  return pick && { cycle: String(pick.name), latest: pick.latest?.name, lts: hasLts ? true : undefined };
}

/** The smallest safe jump: the oldest cycle released after this one that still gets fixes. */
export function nearestSupported(releases, current, now) {
  const later = releases.filter((r) => String(r.releaseDate) > String(current.releaseDate) && ["supported", "security_only"].includes(statusOf(r, now)));
  const pick = later.sort((a, b) => String(a.releaseDate).localeCompare(String(b.releaseDate)))[0];
  return pick && { cycle: String(pick.name), latest: pick.latest?.name, eol: pick.eolFrom ?? undefined };
}

/** One answer for "product version", compact. */
export function describe(product, releases, version, now) {
  const r = matchCycle(releases, version);
  const up = upgradeTarget(releases, now);
  if (!r) {
    return { product: product.name, version, status: "unknown_version", note: `${product.label} has no release cycle matching ${version}. Cycles: ${releases.slice(0, 12).map((x) => x.name).join(", ")}${releases.length > 12 ? ", ..." : ""}.`, upgrade_to: up, link: product.link };
  }
  const status = statusOf(r, now);
  const out = {
    product: product.name,
    version,
    cycle: String(r.name),
    status,
    lts: r.isLts || (r.ltsFrom && past(r.ltsFrom, now)) ? true : undefined,
    // In endoflife.date, "eol" is the end of security fixes; "active_until" the end of regular fixes.
    eol: r.eolFrom ?? undefined,
    // Days of fixes left: to the end of life, or for paid extended support to its end. Never negative.
    days_left: status === "extended_only" ? daysUntil(r.eoesFrom, now) : status === "end_of_life" || status === "upcoming" ? undefined : daysUntil(r.eolFrom, now),
    active_until: r.eoasFrom ?? undefined,
    extended_until: r.eoesFrom ?? undefined,
    latest: r.latest?.name,
    behind_latest_patch: r.latest?.name && version !== r.latest.name && /^\d+(\.\d+){2,}$/.test(version) ? true : undefined,
    link: product.link,
  };
  if (status !== "supported" || (out.days_left !== undefined && out.days_left < 180)) {
    out.upgrade_to = up && up.cycle !== out.cycle ? up : undefined;
    const near = nearestSupported(releases, r, now);
    if (near && near.cycle !== out.upgrade_to?.cycle && near.cycle !== out.cycle) out.nearest_supported = near;
  }
  return out;
}
