// src/mail.mjs
//
// The other email-authentication records: DMARC (found by walking up the DNS tree from the domain,
// as DMARCbis does, so a subdomain inherits its organisation's policy), DKIM keys at named
// selectors (with the key's type and size), MTA-STS, TLS-RPT and BIMI.
import { createPublicKey } from "node:crypto";
import { query, txt } from "./dns.mjs";

export const tags = (record) =>
  Object.fromEntries(
    record
      .split(";")
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => {
        const i = p.indexOf("=");
        return i < 0 ? [p.toLowerCase(), ""] : [p.slice(0, i).trim().toLowerCase(), p.slice(i + 1).trim()];
      }),
  );

/** DMARC for a domain: its own record, or the nearest ancestor's (at most 8 labels up, never the TLD). */
export async function dmarc(ctx, domain) {
  const labels = domain.split(".");
  for (let i = 0; i < Math.min(labels.length - 1, 8); i++) {
    const at = labels.slice(i).join(".");
    const records = (await txt(ctx, `_dmarc.${at}`)).filter((t) => /^v=DMARC1\s*(;|$)/i.test(t));
    if (!records.length) continue;
    const found = { at, record: records[0], inherited: i > 0 || undefined };
    if (records.length > 1) return { ...found, error: `${records.length} DMARC records at _dmarc.${at}; receivers ignore them all` };
    const t = tags(records[0]);
    const problems = [];
    if (!["none", "quarantine", "reject"].includes((t.p ?? "").toLowerCase())) problems.push(t.p === undefined ? "no p= tag (the policy is required)" : `p=${t.p} is not none, quarantine or reject`);
    const pct = t.pct !== undefined ? Number(t.pct) : 100;
    if (!(pct >= 0 && pct <= 100)) problems.push(`pct=${t.pct} is not 0 to 100`);
    for (const k of ["rua", "ruf"]) if (t[k] && !t[k].split(",").every((u) => /^mailto:[^@\s]+@[^@\s]+/i.test(u.trim()))) problems.push(`${k} must be mailto: addresses`);
    return {
      ...found,
      policy: t.p?.toLowerCase(),
      // A subdomain is governed by sp= of the policy it inherits (or np= for names that do not exist).
      subdomain_policy: t.sp?.toLowerCase(),
      pct: pct === 100 ? undefined : pct,
      reports: t.rua ? t.rua.split(",").map((u) => u.trim().replace(/^mailto:/i, "")) : undefined,
      alignment: t.adkim === "s" || t.aspf === "s" ? `strict ${[t.adkim === "s" ? "DKIM" : "", t.aspf === "s" ? "SPF" : ""].filter(Boolean).join(" and ")}` : undefined,
      problems: problems.length ? problems : undefined,
    };
  }
  return null;
}

// Selectors that mail providers publish under; DKIM selectors cannot be listed from DNS, so a
// domain may sign with one that is not here.
export const COMMON_SELECTORS = ["google", "selector1", "selector2", "default", "k1", "k2", "k3", "s1", "s2", "dkim", "mail", "smtp", "mandrill", "mxvault", "resend", "sig1", "protonmail", "protonmail2", "fm1", "fm2", "zoho", "zmail", "mailjet", "sendgrid", "pm", "amazonses", "everlytickey1", "cm", "mta", "key1"];

/** One DKIM selector: record, key type and size, testing and revoked flags. */
export async function dkimSelector(ctx, domain, selector) {
  const name = `${selector}._domainkey.${domain}`;
  const r = await query(ctx, name, "TXT");
  const records = r.answers.map((a) => a.data).filter((t) => /(^|;)\s*(v=DKIM1|k=|p=)/i.test(t));
  if (!records.length) return { selector, found: false };
  const t = tags(records[0]);
  const out = { selector, found: true, key_type: (t.k ?? "rsa").toLowerCase() };
  const p = (t.p ?? "").replace(/\s+/g, "");
  if (!p) return { ...out, revoked: true, problems: ["empty p=: the key is revoked"] };
  const problems = [];
  try {
    const der = Buffer.from(p, "base64");
    if (out.key_type === "ed25519") out.key_bits = der.length === 32 ? 256 : undefined;
    else out.key_bits = createPublicKey({ key: der, format: "der", type: "spki" }).asymmetricKeyDetails?.modulusLength;
  } catch {
    problems.push("the p= key does not decode");
  }
  if (out.key_type === "rsa" && out.key_bits && out.key_bits < 1024) problems.push(`${out.key_bits}-bit RSA key: too weak; receivers reject keys under 1024 bits`);
  else if (out.key_type === "rsa" && out.key_bits && out.key_bits < 2048) out.note = `${out.key_bits}-bit RSA key: accepted, but 2048 bits is the current recommendation`;
  if ((t.t ?? "").split(":").includes("y")) out.testing = true;
  if (records.length > 1) problems.push(`${records.length} records at ${name}`);
  return { ...out, problems: problems.length ? problems : undefined };
}

/** MTA-STS, TLS-RPT and BIMI records (their presence and main tags). */
export async function transportRecords(ctx, domain) {
  const [sts, rpt, bimi] = await Promise.all([txt(ctx, `_mta-sts.${domain}`), txt(ctx, `_smtp._tls.${domain}`), txt(ctx, `default._bimi.${domain}`)]);
  const one = (list, prefix) => list.find((t) => t.toLowerCase().startsWith(prefix));
  const s = one(sts, "v=stsv1");
  const r = one(rpt, "v=tlsrptv1");
  const b = one(bimi, "v=bimi1");
  return {
    mta_sts: s ? { id: tags(s).id } : null,
    tls_rpt: r ? { reports: tags(r).rua } : null,
    bimi: b ? { logo: tags(b).l || undefined, certificate: tags(b).a ? true : undefined } : null,
  };
}

/** CAA records at the domain or, as issuers check them, its nearest ancestor that has any. */
export async function caa(ctx, domain) {
  const labels = domain.split(".");
  for (let i = 0; i < labels.length - 1; i++) {
    const at = labels.slice(i).join(".");
    const r = await query(ctx, at, "CAA");
    if (r.answers.length) {
      const issuers = r.answers.map((a) => a.data.match(/^\d+\s+issue(?:wild)?\s+"?([^";\s]*)/i)?.[1]).filter((x) => x !== undefined);
      return { at, issuers: [...new Set(issuers.map((x) => x || "(none: no CA may issue)"))] };
    }
  }
  return null;
}
