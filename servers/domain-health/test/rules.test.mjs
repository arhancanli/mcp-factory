// The rules against a synthetic DNS: SPF limits and verdicts (RFC 7208), DKIM key sizes, the
// DMARC tree walk, the Public Suffix List, name and address handling. No network.
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";
import { joinTxt, normName } from "../src/dns.mjs";
import { inCidr, reverseIp } from "../src/ip.mjs";
import { dkimSelector, dmarc } from "../src/mail.mjs";
import { registrable } from "../src/rdap.mjs";
import { checkSpf, expand, parseSpf } from "../src/spf.mjs";
import { createContext } from "../src/server.mjs";

const TYPE = { A: 1, MX: 15, TXT: 16, AAAA: 28 };

/** A context whose resolver answers from a zone: {name: {TXT: [...], A: [...], MX: [...]}}. */
function zoneCtx(zone, extra = {}) {
  const fetchImpl = async (url) => {
    const u = new URL(url);
    if (extra[u.href]) return new Response(extra[u.href], { status: 200 });
    const name = u.searchParams.get("name");
    const type = u.searchParams.get("type");
    const node = zone[name];
    const data = node?.[type] ?? [];
    const body = { Status: node ? 0 : 3, AD: false, Answer: data.map((d) => ({ name: `${name}.`, type: TYPE[type], TTL: 60, data: type === "TXT" ? `"${d}"` : d })) };
    return new Response(JSON.stringify(body), { status: 200 });
  };
  return createContext({ fetchImpl });
}

test("SPF: more than 10 lookups is a permerror, counted across the include tree", async () => {
  const zone = { "big.test": { TXT: [`v=spf1 ${Array.from({ length: 11 }, (_, i) => `include:i${i}.test`).join(" ")} -all`] } };
  for (let i = 0; i < 11; i++) zone[`i${i}.test`] = { TXT: [`v=spf1 ip4:10.0.${i}.0/24 -all`] };
  const r = await checkSpf(zoneCtx(zone), "big.test");
  assert.equal(r.lookups, 11);
  assert.match(r.problems.join(" "), /11 DNS lookups; the limit is 10/);
  const v = await checkSpf(zoneCtx(zone), "big.test", { ip: "10.0.10.5" });
  assert.equal(v.result, "permerror", "the 11th include is past the limit, so a receiver stops before it");
  const early = await checkSpf(zoneCtx(zone), "big.test", { ip: "10.0.0.5" });
  assert.equal(early.result, "pass", "a match within the first 10 lookups still passes");
});

test("SPF: loops, missing include targets, several records and bad syntax are permerrors", async () => {
  const zone = {
    "loop.test": { TXT: ["v=spf1 include:loop2.test -all"] },
    "loop2.test": { TXT: ["v=spf1 include:loop.test -all"] },
    "missing.test": { TXT: ["v=spf1 include:nothing-here.test -all"] },
    "two.test": { TXT: ["v=spf1 -all", "v=spf1 ~all"] },
    "syntax.test": { TXT: ["v=spf1 ip4:300.1.1.1 foo -all"] },
  };
  const ctx = zoneCtx(zone);
  assert.equal((await checkSpf(ctx, "loop.test", { ip: "192.0.2.1" })).result, "permerror");
  const miss = await checkSpf(ctx, "missing.test", { ip: "192.0.2.1" });
  assert.deepEqual([miss.result, /no SPF record/.test(miss.matched)], ["permerror", true], "include of a name without SPF is a permerror, not a no-match");
  assert.match((await checkSpf(ctx, "two.test")).problems[0], /2 SPF records/);
  assert.match((await checkSpf(ctx, "syntax.test")).problems[0], /bad ip4.*unknown term "foo"/);
  assert.equal((await checkSpf(ctx, "none.test", { ip: "192.0.2.1" })).result, "none");
});

test("SPF: a, mx, ip6 ranges, redirect only without all, void lookups, macros", async () => {
  const zone = {
    "mail.test": { TXT: ["v=spf1 a mx ip6:2001:db8::/32 redirect=other.test"], A: ["192.0.2.10"], MX: ["10 mx1.mail.test."] },
    "mx1.mail.test": { A: ["198.51.100.7"] },
    "other.test": { TXT: ["v=spf1 ip4:203.0.113.0/24 -all"] },
    "both.test": { TXT: ["v=spf1 ~all redirect=other.test"] },
    "voids.test": { TXT: ["v=spf1 a:v1.test a:v2.test a:v3.test -all"] },
    "macro.test": { TXT: ["v=spf1 exists:%{i}._spf.macro.test -all"] },
    "192.0.2.99._spf.macro.test": { A: ["127.0.0.2"] },
  };
  const ctx = zoneCtx(zone);
  const at = (ip, d = "mail.test") => checkSpf(ctx, d, { ip }).then((r) => r.result);
  assert.equal(await at("192.0.2.10"), "pass", "a");
  assert.equal(await at("198.51.100.7"), "pass", "mx");
  assert.equal(await at("2001:db8:1::5"), "pass", "ip6 range");
  assert.equal(await at("203.0.113.9"), "pass", "redirect when nothing matched");
  assert.equal(await at("8.8.8.8"), "fail", "the redirect target's -all");
  const both = await checkSpf(ctx, "both.test", { ip: "203.0.113.9" });
  assert.equal(both.result, "softfail", "redirect is ignored when the record has all");
  assert.match(both.tree.warnings[0], /redirect= is ignored/);
  const voids = await checkSpf(ctx, "voids.test", { ip: "192.0.2.1" });
  assert.deepEqual([voids.void_lookups, voids.result], [3, "permerror"]);
  assert.equal(await at("192.0.2.99", "macro.test"), "pass", "exists with %{i}");
  assert.equal(await at("192.0.2.98", "macro.test"), "fail");
  assert.equal(expand("%{ir}.%{v}._spf.%{d2}", { ip: "192.0.2.1", domain: "a.b.example.com", sender: "x@y" }).value, "1.2.0.192.in-addr._spf.example.com");
  assert.equal(parseSpf("v=spf1 ip6:2001:db8::/32 -all").terms[0].value, "2001:db8::");
});

test("DKIM: key sizes from the published key, revoked and testing keys", async () => {
  const pem = (bits) => generateKeyPairSync("rsa", { modulusLength: bits }).publicKey.export({ type: "spki", format: "der" }).toString("base64");
  const zone = {
    "big._domainkey.d.test": { TXT: [`v=DKIM1; k=rsa; p=${pem(2048)}`] },
    "weak._domainkey.d.test": { TXT: [`v=DKIM1; k=rsa; t=y; p=${pem(512)}`] },
    "gone._domainkey.d.test": { TXT: ["v=DKIM1; p="] },
  };
  const ctx = zoneCtx(zone);
  assert.deepEqual(await dkimSelector(ctx, "d.test", "big"), { selector: "big", found: true, key_type: "rsa", key_bits: 2048, problems: undefined });
  const weak = await dkimSelector(ctx, "d.test", "weak");
  assert.deepEqual([weak.key_bits, weak.testing, /too weak/.test(weak.problems[0])], [512, true, true]);
  assert.equal((await dkimSelector(ctx, "d.test", "gone")).revoked, true);
  assert.equal((await dkimSelector(ctx, "d.test", "absent")).found, false);
});

test("DMARC: a subdomain inherits its organisation's policy; bad tags are problems", async () => {
  const zone = { "_dmarc.example.test": { TXT: ["v=DMARC1; p=quarantine; sp=reject; pct=50; rua=mailto:d@example.test"] }, "_dmarc.bad.test": { TXT: ["v=DMARC1; p=maybe; rua=https://x"] } };
  const ctx = zoneCtx(zone);
  const sub = await dmarc(ctx, "mail.example.test");
  assert.deepEqual([sub.at, sub.inherited, sub.policy, sub.subdomain_policy, sub.pct, sub.reports], ["example.test", true, "quarantine", "reject", 50, ["d@example.test"]]);
  const bad = await dmarc(ctx, "bad.test");
  assert.equal(bad.problems.length, 2);
  assert.equal(await dmarc(ctx, "nothing.test"), null);
});

test("names, TXT strings, addresses and the Public Suffix List", async () => {
  assert.equal(normName("https://Mail.Example.COM/path?q=1"), "mail.example.com");
  assert.equal(normName("user@example.org"), "example.org");
  assert.equal(normName("bücher.de"), "xn--bcher-kva.de");
  assert.throws(() => normName("not a domain"), { code: "bad_domain" });
  assert.equal(joinTxt('"v=spf1 include:a.test " "-all"'), "v=spf1 include:a.test -all", "split strings join without a separator");
  assert.equal(joinTxt('"say \\"hi\\""'), 'say "hi"');
  assert.ok(inCidr("2001:db8::1", "2001:db8::", 32));
  assert.ok(!inCidr("2001:db9::1", "2001:db8::", 32));
  assert.ok(inCidr("10.1.2.3", "10.0.0.0", 8) && !inCidr("11.1.2.3", "10.0.0.0", 8) && inCidr("1.2.3.4", "0.0.0.0", 0));
  assert.ok(inCidr("::ffff:192.0.2.1", "::ffff:192.0.2.0", 120), "embedded IPv4");
  assert.equal(reverseIp("2001:db8::1").split(".").length, 32);
  const psl = "// ===BEGIN ICANN DOMAINS===\ncom\nuk\nco.uk\n*.ck\n!www.ck\n// ===END ICANN DOMAINS===\nblogspot.com\n";
  const ctx = zoneCtx({}, { "https://publicsuffix.org/list/public_suffix_list.dat": psl });
  assert.equal(await registrable(ctx, "a.b.example.co.uk"), "example.co.uk");
  assert.equal(await registrable(ctx, "mail.google.com"), "google.com");
  assert.equal(await registrable(ctx, "x.foo.ck"), "x.foo.ck", "wildcard: foo.ck is a suffix");
  assert.equal(await registrable(ctx, "www.ck"), "www.ck", "exception");
  assert.equal(await registrable(ctx, "co.uk"), undefined);
  assert.equal(await registrable(ctx, "me.blogspot.com"), "blogspot.com", "private section rules are not used");
});
