// src/spf.mjs
//
// SPF (RFC 7208), evaluated the way a receiving mail server does it, plus the static picture every
// SPF checker gives: the whole include tree, every address range, and the DNS lookup count against
// the limit of 10 (include, a, mx, ptr, exists and redirect each cost one; more than 10 is a
// permerror, and mail then fails SPF everywhere). Void lookups (a name with no answer) are limited
// to 2. With a sending IP, the result is what a receiver would conclude: pass, fail, softfail,
// neutral, none, permerror or temperror, and which mechanism decided it.
import { addresses, mx, txt } from "./dns.mjs";
import { inCidr, ipVersion, reverseIp } from "./ip.mjs";

export const LOOKUP_LIMIT = 10;
export const VOID_LIMIT = 2;
const MX_LIMIT = 10;
const MAX_DEPTH = 12;
const COUNTED = new Set(["include", "a", "mx", "ptr", "exists", "redirect"]);
const QUALIFIER = { "+": "pass", "-": "fail", "~": "softfail", "?": "neutral" };

export const isSpf = (t) => /^v=spf1(\s|$)/i.test(t.trim());

/** Terms of a record, or the syntax errors that make it a permerror. */
export function parseSpf(record) {
  const terms = [];
  const errors = [];
  const modifiers = {};
  for (const token of record.trim().split(/\s+/).slice(1)) {
    const mod = token.match(/^([a-z][a-z0-9_.-]*)=(.*)$/i);
    if (mod) {
      const key = mod[1].toLowerCase();
      if ((key === "redirect" || key === "exp") && key in modifiers) errors.push(`${key}= appears twice`);
      modifiers[key] = mod[2];
      continue;
    }
    const m = token.match(/^([+\-~?]?)(all|include|a|mx|ptr|ip4|ip6|exists)(?::([^/]*))?(?:\/(\d{1,3}))?(?:\/\/(\d{1,3}))?$/i);
    if (!m) {
      errors.push(`unknown term "${token}"`);
      continue;
    }
    const [, q, mech, value, c4, c6] = m;
    const t = { qualifier: q || "+", mechanism: mech.toLowerCase(), value: value || undefined, cidr4: c4 !== undefined ? Number(c4) : undefined, cidr6: c6 !== undefined ? Number(c6) : undefined, text: token };
    if ((t.mechanism === "include" || t.mechanism === "exists") && !t.value) errors.push(`${t.mechanism} needs a domain`);
    if (t.mechanism === "ip4" && (ipVersion(t.value) !== 4 || (t.cidr4 ?? 32) > 32)) errors.push(`bad ip4 "${token}"`);
    if (t.mechanism === "ip6") {
      // "ip6:2001:db8::/32": the value runs to the last slash.
      const v6 = token.replace(/^[+\-~?]?ip6:/i, "");
      const [addr, bits] = v6.split("/");
      t.value = addr;
      t.cidr6 = bits !== undefined ? Number(bits) : undefined;
      t.cidr4 = undefined;
      if (ipVersion(addr) !== 6 || (t.cidr6 ?? 128) > 128) errors.push(`bad ip6 "${token}"`);
    }
    terms.push(t);
  }
  return { terms, modifiers, errors };
}

/** Macro expansion (RFC 7208 7): the letters agents meet in practice, with digit and reverse transformers. */
export function expand(spec, env) {
  if (!spec.includes("%")) return { value: spec };
  let needsIp = false;
  const value = spec.replace(/%(%|_|-|\{([slodiphcrtv])(\d*)(r?)([.\-+,/_=]*)\})/gi, (whole, simple, letter, digits, rev, delims) => {
    if (simple === "%") return "%";
    if (simple === "_") return " ";
    if (simple === "-") return "%20";
    const l = letter.toLowerCase();
    let v;
    if (l === "i" || l === "c" || l === "v") {
      if (!env.ip) needsIp = true;
      v = l === "v" ? (ipVersion(env.ip) === 6 ? "ip6" : "in-addr") : env.ip ? (ipVersion(env.ip) === 6 ? reverseIp(env.ip).split(".").reverse().join(".") : env.ip) : "0.0.0.0";
    } else if (l === "s") v = env.sender;
    else if (l === "l") v = env.sender.split("@")[0];
    else if (l === "o") v = env.sender.split("@")[1];
    else if (l === "d" || l === "h") v = env.domain;
    else v = "unknown";
    let parts = v.split(new RegExp(`[${(delims || ".").replace(/[-\\\]^]/g, "\\$&")}]`));
    if (rev) parts = parts.reverse();
    if (digits) parts = parts.slice(-Number(digits));
    return parts.join(".");
  });
  return { value, needsIp };
}

const matchAddrs = (ip, addrs, c4, c6) => (ipVersion(ip) === 4 ? addrs.v4.some((a) => inCidr(ip, a, c4 ?? 32)) : addrs.v6.some((a) => inCidr(ip, a, c6 ?? 128)));

/**
 * Walks a domain's SPF. state carries the lookup and void counters across the tree.
 * @returns {Promise<{result?: string, matched?: string, node: object}>}
 */
async function walk(ctx, domain, state, env, depth = 0) {
  const node = { domain };
  if (depth > MAX_DEPTH) {
    node.error = "include chain too deep";
    return { result: "permerror", node };
  }
  let records;
  try {
    records = (await txt(ctx, domain)).filter(isSpf);
  } catch {
    node.error = "DNS lookup failed";
    return { result: "temperror", node };
  }
  if (!records.length) {
    node.error = "no SPF record";
    return { result: "none", node };
  }
  if (records.length > 1) {
    node.error = `${records.length} SPF records; there must be one`;
    node.records = records;
    return { result: "permerror", node };
  }
  node.record = records[0];
  const { terms, modifiers, errors } = parseSpf(records[0]);
  if (errors.length) {
    node.error = errors.join("; ");
    return { result: "permerror", node };
  }
  let decided = null; // {result, matched} from the first matching mechanism, as a receiver stops there
  const decide = (result, text) => {
    if (!decided) decided = { result, matched: `${domain}: ${text}` };
  };
  const count = (t) => {
    state.lookups++;
    if (state.lookups > LOOKUP_LIMIT && !state.overAt) state.overAt = `${domain}: ${t.text}`;
  };
  for (const t of terms) {
    if (COUNTED.has(t.mechanism)) count(t);
    // Past the limit, a receiver has already stopped with permerror.
    if (env.ip && state.overAt && !decided) decide("permerror", `more than ${LOOKUP_LIMIT} DNS lookups (at ${state.overAt})`);
    switch (t.mechanism) {
      case "all":
        node.all = t.text;
        if (env.ip) decide(QUALIFIER[t.qualifier], t.text);
        break;
      case "ip4":
      case "ip6": {
        (node[t.mechanism] ??= []).push(`${t.value}${t.mechanism === "ip4" ? (t.cidr4 !== undefined ? `/${t.cidr4}` : "") : t.cidr6 !== undefined ? `/${t.cidr6}` : ""}`);
        if (env.ip && ipVersion(env.ip) === (t.mechanism === "ip4" ? 4 : 6) && inCidr(env.ip, t.value, t.mechanism === "ip4" ? (t.cidr4 ?? 32) : (t.cidr6 ?? 128))) decide(QUALIFIER[t.qualifier], t.text);
        break;
      }
      case "a": {
        const target = expand(t.value ?? domain, { ...env, domain });
        if (target.needsIp) break;
        const addrs = await addresses(ctx, target.value);
        if (addrs.void) state.voids++;
        (node.a ??= []).push({ name: target.value, addresses: [...addrs.v4, ...addrs.v6].length });
        if (env.ip && matchAddrs(env.ip, addrs, t.cidr4, t.cidr6)) decide(QUALIFIER[t.qualifier], t.text);
        break;
      }
      case "mx": {
        const target = expand(t.value ?? domain, { ...env, domain });
        const m = await mx(ctx, target.value);
        if (!m.hosts.length) state.voids++;
        if (m.hosts.length > MX_LIMIT) {
          node.error = `mx: ${target.value} has ${m.hosts.length} MX hosts; SPF allows ${MX_LIMIT}`;
          if (env.ip) decide("permerror", t.text);
        }
        const all = await Promise.all(m.hosts.slice(0, MX_LIMIT).map((h) => addresses(ctx, h.host)));
        (node.mx ??= []).push({ name: target.value, hosts: m.hosts.length });
        if (env.ip && all.some((addrs) => matchAddrs(env.ip, addrs, t.cidr4, t.cidr6))) decide(QUALIFIER[t.qualifier], t.text);
        break;
      }
      case "ptr":
        (node.warnings ??= []).push("ptr is deprecated (RFC 7208 5.5) and many receivers ignore it; list the addresses instead");
        break;
      case "exists": {
        const target = expand(t.value, { ...env, domain });
        (node.exists ??= []).push(t.value);
        if (target.needsIp) {
          (node.notes ??= []).push(`${t.text} depends on the sending IP`);
          if (!env.ip) break;
        }
        const addrs = await addresses(ctx, target.value);
        if (!addrs.v4.length) state.voids += addrs.void ? 1 : 0;
        if (env.ip && addrs.v4.length) decide(QUALIFIER[t.qualifier], t.text);
        break;
      }
      case "include": {
        const target = expand(t.value, { ...env, domain });
        if (target.needsIp) {
          (node.notes ??= []).push(`${t.text} depends on the sending IP`);
          if (!env.ip) break;
        }
        if (state.seen.has(target.value)) {
          node.error = `include loop at ${target.value}`;
          if (env.ip) decide("permerror", t.text);
          break;
        }
        state.seen.add(target.value);
        const child = await walk(ctx, target.value, state, env, depth + 1);
        state.seen.delete(target.value);
        (node.includes ??= []).push(child.node);
        if (env.ip && !decided) {
          // RFC 7208 5.2: include matches on pass; none and permerror become permerror; temperror stays.
          if (child.result === "pass") decide(QUALIFIER[t.qualifier], t.text);
          else if (child.result === "temperror") decide("temperror", `${t.text} (${child.node.error ?? "temperror"})`);
          else if (child.result === "permerror" || child.result === "none") decide("permerror", `${t.text} (${child.node.error ?? child.result})`);
        }
        break;
      }
    }
  }
  if (modifiers.redirect && !node.all) {
    const target = expand(modifiers.redirect, { ...env, domain });
    count({ text: `redirect=${modifiers.redirect}` });
    const child = await walk(ctx, target.value, state, env, depth + 1);
    node.redirect = child.node;
    if (env.ip && !decided) decide(child.result === "none" ? "permerror" : child.result, `redirect=${modifiers.redirect}${child.matched ? ` -> ${child.matched}` : ""}`);
  } else if (modifiers.redirect) {
    (node.warnings ??= []).push("redirect= is ignored because the record has an all mechanism");
  }
  if (env.ip && !decided) decide("neutral", "no mechanism matched (default neutral)");
  return { ...(decided ?? {}), node };
}

/**
 * The full check. ip (optional) is evaluated as a receiver would; sender defaults to postmaster@domain.
 * @returns {Promise<object>}
 */
export async function checkSpf(ctx, domain, { ip, sender } = {}) {
  const state = { lookups: 0, voids: 0, seen: new Set([domain]) };
  const env = { ip, sender: sender ?? `postmaster@${domain}` };
  const out = await walk(ctx, domain, state, env);
  const problems = [];
  if (out.node.error) problems.push(out.node.error);
  if (state.lookups > LOOKUP_LIMIT) problems.push(`${state.lookups} DNS lookups; the limit is ${LOOKUP_LIMIT}, so receivers return permerror`);
  if (state.voids > VOID_LIMIT) problems.push(`${state.voids} void lookups (names with no answer); receivers may return permerror above ${VOID_LIMIT}`);
  let result = out.result;
  if (ip && state.voids > VOID_LIMIT && result !== "permerror") result = "permerror";
  return { tree: out.node, lookups: state.lookups, void_lookups: state.voids, problems, result, matched: out.matched };
}

/** Every error and warning anywhere in the tree, with the domain it belongs to. */
export function treeIssues(node, out = []) {
  if (node.error) out.push(`${node.domain}: ${node.error}`);
  for (const w of node.warnings ?? []) out.push(`${node.domain}: ${w}`);
  for (const c of node.includes ?? []) treeIssues(c, out);
  if (node.redirect) treeIssues(node.redirect, out);
  return out;
}
