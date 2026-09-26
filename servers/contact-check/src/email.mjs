// src/email.mjs
//
// Email addresses: syntax as mail servers accept it (RFC 5321 limits, the characters providers
// allow), whether the domain accepts mail (MX records, or an address when there are none; a null MX
// says it takes no mail), disposable providers (the community-kept disposable-email-domains list,
// CC0), role accounts, and likely typos of the big providers' domains. Nothing is ever sent.
const DOH = "https://cloudflare-dns.com/dns-query";
const DISPOSABLE = "https://raw.githubusercontent.com/disposable-email-domains/disposable-email-domains/main/disposable_email_blocklist.conf";
const ROLES = new Set(["admin", "administrator", "info", "support", "sales", "contact", "hello", "help", "billing", "noreply", "no-reply", "postmaster", "webmaster", "hostmaster", "abuse", "security", "office", "team", "marketing", "jobs", "careers", "press", "privacy", "legal"]);
const PROVIDERS = ["gmail.com", "googlemail.com", "yahoo.com", "hotmail.com", "outlook.com", "live.com", "icloud.com", "me.com", "aol.com", "proton.me", "protonmail.com", "gmx.com", "gmx.de", "web.de", "yandex.com", "mail.ru", "qq.com", "163.com", "zoho.com", "fastmail.com", "hotmail.co.uk", "yahoo.co.uk", "btinternet.com", "comcast.net", "verizon.net", "att.net"];

/** Syntax problems of an address, or []. */
export function syntaxProblems(address) {
  const problems = [];
  const at = address.lastIndexOf("@");
  if (at < 1 || at === address.length - 1) return ["needs one @ with text on both sides"];
  const local = address.slice(0, at);
  const domain = address.slice(at + 1);
  if (address.length > 254) problems.push("longer than 254 characters");
  if (local.length > 64) problems.push("the part before @ is longer than 64 characters");
  if (/^\.|\.$|\.\./.test(local)) problems.push("the part before @ starts or ends with a dot, or has two in a row");
  if (!/^[A-Za-z0-9!#$%&'*+/=?^_`{|}~.-]+$/.test(local)) problems.push("the part before @ has characters mail providers do not accept (spaces, commas, quotes...)");
  if (!/^(?=.{1,253}$)([A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/.test(domainAscii(domain))) problems.push("the domain is not a valid host name");
  return problems;
}

const domainAscii = (d) => {
  try {
    return new URL(`http://${d}`).hostname;
  } catch {
    return d;
  }
};

/** Edit distance where swapping two neighbouring letters is one edit (gmial -> gmail). */
export function distance(a, b, max = 2) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  return d[a.length][b.length];
}

/** A big provider's domain the given one is probably a typo of. */
export function typoOf(domain) {
  if (PROVIDERS.includes(domain)) return undefined;
  const fixedTld = domain.replace(/\.(con|cmo|cm|comm|om|co)$/, ".com");
  if (fixedTld !== domain && PROVIDERS.includes(fixedTld)) return fixedTld;
  return PROVIDERS.find((p) => distance(domain, p) <= (p.length >= 10 ? 2 : 1));
}

async function mailRecords(ctx, domain) {
  const ask = async (type) => {
    const r = await ctx.fetcher.request(`${DOH}?name=${encodeURIComponent(domain)}&type=${type}`, { accept: "application/dns-json" });
    const d = JSON.parse(r.text);
    return { status: d.Status, answers: (d.Answer ?? []).filter((a) => a.type === (type === "MX" ? 15 : type === "A" ? 1 : 28)).map((a) => String(a.data)) };
  };
  const mx = await ask("MX");
  if (mx.status === 3) return { exists: false };
  const hosts = mx.answers.map((d) => d.split(/\s+/)).map(([p, h]) => ({ priority: Number(p), host: (h ?? "").replace(/\.$/, "") }));
  if (hosts.length === 1 && hosts[0].host === "") return { exists: true, nullMx: true };
  if (hosts.length) return { exists: true, mx: hosts.sort((x, y) => x.priority - y.priority).map((h) => h.host) };
  // No MX: mail goes to the domain's own address (RFC 5321 5.1), if it has one.
  const [a, aaaa] = await Promise.all([ask("A"), ask("AAAA")]);
  return { exists: true, implicit: a.answers.length + aaaa.answers.length > 0 };
}

async function disposableSet(ctx) {
  if (ctx.disposable && Date.now() - ctx.disposable.at < 86_400_000) return ctx.disposable.set;
  const r = await ctx.fetcher.request(DISPOSABLE, { accept: "text/plain" });
  const set = new Set(r.ok ? r.text.split("\n").map((l) => l.trim().toLowerCase()).filter((l) => l && !l.startsWith("#")) : []);
  ctx.disposable = { at: Date.now(), set };
  return set;
}

export async function checkEmail(ctx, raw) {
  const input = String(raw ?? "").trim();
  const address = input.replace(/^mailto:/i, "").replace(/^.*<([^>]+)>.*$/, "$1").trim();
  const problems = syntaxProblems(address);
  if (problems.length) return { input, valid: false, reason: problems.join("; ") };
  const at = address.lastIndexOf("@");
  const local = address.slice(0, at);
  const domain = domainAscii(address.slice(at + 1).toLowerCase());
  const [records, disposable] = await Promise.all([mailRecords(ctx, domain), disposableSet(ctx)]);
  const typo = typoOf(domain);
  const out = { input, normalized: `${local}@${domain}`, domain };
  if (!records.exists) return { ...out, valid: false, reason: `${domain} does not exist in DNS`, did_you_mean: typo ? `${local}@${typo}` : undefined };
  if (records.nullMx) return { ...out, valid: false, reason: `${domain} publishes a null MX: it accepts no mail`, did_you_mean: typo ? `${local}@${typo}` : undefined };
  if (!records.mx && !records.implicit) return { ...out, valid: false, reason: `${domain} has no mail servers (no MX record and no address)`, did_you_mean: typo ? `${local}@${typo}` : undefined };
  return {
    ...out,
    valid: true,
    mail_servers: records.mx?.slice(0, 3) ?? ["(the domain's own address)"],
    disposable: disposable.has(domain) || undefined,
    role_account: ROLES.has(local.toLowerCase().split("+")[0]) || undefined,
    did_you_mean: typo ? `${local}@${typo}` : undefined,
    note: typo ? `${domain} accepts mail, but it looks like a typo of ${typo}.` : undefined,
  };
}
