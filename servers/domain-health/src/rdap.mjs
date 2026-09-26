// src/rdap.mjs
//
// Registration data from the registry's own RDAP server (RFC 9082/9083), found through IANA's
// bootstrap file: registrar, creation and expiry dates, status codes, DNSSEC delegation, name
// servers. Only servers IANA lists are contacted: the RDAP fetcher's host allowlist is built from
// the bootstrap itself. The registrable domain (google.com for mail.google.com, bbc.co.uk for
// www.bbc.co.uk) comes from the Public Suffix List.
import { createFetcher, TtlCache, ToolError } from "./kit/index.mjs";

const BOOTSTRAP = "https://data.iana.org/rdap/dns.json";
const PSL = "https://publicsuffix.org/list/public_suffix_list.dat";
const DAY = 86_400_000;

async function cached(ctx, key, ttl, load) {
  const hit = ctx.memo?.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.value;
  ctx.memo ??= new Map();
  const pending = ctx.memo.get(`${key}:pending`) ?? load().finally(() => ctx.memo.delete(`${key}:pending`));
  ctx.memo.set(`${key}:pending`, pending);
  const value = await pending;
  ctx.memo.set(key, { at: Date.now(), value });
  return value;
}

/** TLD -> RDAP base URL, and an RDAP fetcher allowed to reach exactly those servers. */
async function bootstrap(ctx) {
  return cached(ctx, "bootstrap", DAY, async () => {
    const { data } = await ctx.fetcher.getJson(BOOTSTRAP);
    const byTld = new Map();
    const hosts = new Set();
    for (const [tlds, urls] of data.services ?? []) {
      const base = urls.find((u) => u.startsWith("https://"));
      if (!base) continue;
      hosts.add(new URL(base).hostname);
      for (const t of tlds) byTld.set(t.toLowerCase(), base.endsWith("/") ? base : `${base}/`);
    }
    const fetcher = createFetcher({
      allowHosts: [...hosts],
      userAgent: ctx.userAgent,
      cache: new TtlCache({ ttlMs: 10 * 60_000, maxEntries: 500 }),
      limits: [...hosts].map((h) => ({ host: h, perSecond: 2, concurrency: 2 })),
      timeoutMs: 15_000,
      attemptTimeoutMs: 8_000,
      fetchImpl: ctx.fetchImpl,
    });
    return { byTld, fetcher };
  });
}

/** Public suffix rules (the ICANN section): exact suffixes, wildcards and exceptions. */
async function suffixes(ctx) {
  return cached(ctx, "psl", 7 * DAY, async () => {
    const res = await ctx.fetcher.request(PSL, { accept: "text/plain" });
    if (!res.ok) throw new ToolError("psl_unavailable", `The Public Suffix List answered ${res.status}.`);
    const icann = res.text.split("===END ICANN DOMAINS===")[0];
    const rules = { exact: new Set(), wild: new Set(), except: new Set() };
    const ascii = (s) => new URL(`http://${s}`).hostname; // IDN rules to punycode, as names arrive
    for (const raw of icann.split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("//")) continue;
      try {
        if (line.startsWith("!")) rules.except.add(ascii(line.slice(1)));
        else if (line.startsWith("*.")) rules.wild.add(ascii(line.slice(2)));
        else rules.exact.add(ascii(line));
      } catch {
        // a rule that does not parse is skipped
      }
    }
    return rules;
  });
}

/** The registrable domain: the public suffix plus one label. Undefined when the name is itself a public suffix. */
export async function registrable(ctx, name) {
  const rules = await suffixes(ctx);
  const labels = name.split(".");
  let suffixLen = 1;
  for (let i = 0; i < labels.length; i++) {
    const cand = labels.slice(i).join(".");
    const parent = labels.slice(i + 1).join(".");
    if (rules.except.has(cand)) {
      suffixLen = labels.length - i - 1;
      break;
    }
    if (rules.exact.has(cand) || (parent && rules.wild.has(parent))) {
      suffixLen = labels.length - i;
      break;
    }
  }
  return labels.length > suffixLen ? labels.slice(-(suffixLen + 1)).join(".") : undefined;
}

const vcardName = (e) => e?.vcardArray?.[1]?.find((f) => f[0] === "fn")?.[3];

/**
 * Registration of one domain. @returns {Promise<object>} with registered: true/false, or an
 * rdap: "unsupported" answer when the TLD has no RDAP service.
 */
export async function lookupDomain(ctx, name) {
  const domain = await registrable(ctx, name);
  if (!domain) throw new ToolError("public_suffix", `${name} is a public suffix (like co.uk), not a registrable domain.`);
  const tld = domain.split(".").pop();
  const { byTld, fetcher } = await bootstrap(ctx);
  const base = byTld.get(tld);
  if (!base) return { domain, rdap: "unsupported", note: `The .${tld} registry runs no RDAP service listed by IANA; check its own WHOIS.` };
  const { status, data } = await fetcher.getJson(`${base}domain/${domain}`, { allowStatus: [404] });
  if (status === 404) return { domain, registered: false, note: "Not in the registry. Likely available; reserved and premium names also show this way, so confirm at a registrar." };
  const events = Object.fromEntries((data.events ?? []).map((e) => [e.eventAction, e.eventDate?.slice(0, 10)]));
  const registrar = (data.entities ?? []).find((e) => e.roles?.includes("registrar"));
  const expires = events.expiration;
  return {
    domain,
    registered: true,
    registrar: vcardName(registrar),
    registrar_iana_id: registrar?.publicIds?.find((p) => /iana/i.test(p.type))?.identifier,
    created: events.registration,
    expires,
    days_left: expires ? Math.floor((Date.parse(expires) - (ctx.now?.() ?? Date.now())) / DAY) : undefined,
    updated: events["last changed"],
    status: data.status,
    dnssec: data.secureDNS?.delegationSigned ?? undefined,
    nameservers: (data.nameservers ?? []).map((n) => n.ldhName?.toLowerCase().replace(/\.$/, "")).filter(Boolean),
  };
}
