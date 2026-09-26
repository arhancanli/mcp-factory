// src/dns.mjs
//
// DNS over HTTPS (JSON API) from two public resolvers, Cloudflare and Google, so answers do not
// depend on the network the server runs on and propagation can be compared. The "AD" flag says the
// resolver validated the answer with DNSSEC.
import { ToolError } from "./kit/index.mjs";

export const RESOLVERS = {
  cloudflare: "https://cloudflare-dns.com/dns-query",
  google: "https://dns.google/resolve",
};

export const TYPES = { A: 1, NS: 2, CNAME: 5, SOA: 6, PTR: 12, MX: 15, TXT: 16, AAAA: 28, SRV: 33, DS: 43, DNSKEY: 48, SVCB: 64, HTTPS: 65, CAA: 257 };
const TYPE_NAMES = Object.fromEntries(Object.entries(TYPES).map(([k, v]) => [v, k]));
const RCODES = { 0: "NOERROR", 1: "FORMERR", 2: "SERVFAIL", 3: "NXDOMAIN", 4: "NOTIMP", 5: "REFUSED" };

/** A domain name as DNS wants it: lowercased, no trailing dot, labels checked. */
export function normName(raw) {
  let name = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, "")
    .replace(/[/?#].*$/, "")
    .replace(/:\d+$/, "")
    .replace(/\.$/, "");
  if (name.includes("@")) name = name.split("@").pop();
  try {
    name = new URL(`http://${name}`).hostname; // IDNs to punycode
  } catch {
    throw new ToolError("bad_domain", `"${raw}" is not a domain name.`);
  }
  if (!/^(?=.{1,253}$)([a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9])?\.)+[a-z0-9-]{2,63}$/.test(name)) throw new ToolError("bad_domain", `"${raw}" is not a domain name.`);
  return name;
}

/** TXT data arrives as one or more quoted strings; a record is their concatenation (RFC 7208 3.3). */
export function joinTxt(data) {
  const s = String(data ?? "");
  if (!s.startsWith('"')) return s;
  let out = "";
  const re = /"((?:[^"\\]|\\.)*)"/g;
  let m;
  while ((m = re.exec(s))) out += m[1].replace(/\\(\d{3})/g, (_, d) => String.fromCharCode(Number(d))).replace(/\\(.)/g, "$1");
  return out;
}

/**
 * One query. @returns {{status: string, ad: boolean, answers: {name: string, type: string, ttl: number, data: string}[]}}
 * answers holds only records of the asked type (the CNAME chain is left out).
 */
export async function query(ctx, name, type, resolver = "cloudflare") {
  const base = RESOLVERS[resolver];
  const res = await ctx.fetcher.request(`${base}?name=${encodeURIComponent(name)}&type=${type}`, { accept: "application/dns-json" });
  if (!res.ok) throw new ToolError("dns_unavailable", `The ${resolver} resolver answered ${res.status} for ${name} ${type}.`);
  const d = JSON.parse(res.text);
  const want = TYPES[type];
  const answers = (d.Answer ?? []).filter((a) => a.type === want).map((a) => ({ name: a.name.replace(/\.$/, ""), type: TYPE_NAMES[a.type] ?? String(a.type), ttl: a.TTL, data: type === "TXT" ? joinTxt(a.data) : String(a.data).replace(/\.$/, "") }));
  return { status: RCODES[d.Status] ?? `RCODE${d.Status}`, ad: Boolean(d.AD), answers };
}

/** TXT strings at a name ([] for none or NXDOMAIN). */
export async function txt(ctx, name) {
  const r = await query(ctx, name, "TXT");
  return r.answers.map((a) => a.data);
}

/** Addresses of a name: {v4: string[], v6: string[], void: boolean} (void = no address at all, RFC 7208 4.6.4). */
export async function addresses(ctx, name) {
  const [a, aaaa] = await Promise.all([query(ctx, name, "A"), query(ctx, name, "AAAA")]);
  const v4 = a.answers.map((x) => x.data);
  const v6 = aaaa.answers.map((x) => x.data);
  return { v4, v6, void: !v4.length && !v6.length };
}

/** MX hosts in preference order: [{priority, host}]. */
export async function mx(ctx, name) {
  const r = await query(ctx, name, "MX");
  return { status: r.status, hosts: r.answers.map((a) => a.data.split(/\s+/)).map(([p, h]) => ({ priority: Number(p), host: (h ?? "").replace(/\.$/, "") })).sort((x, y) => x.priority - y.priority) };
}
