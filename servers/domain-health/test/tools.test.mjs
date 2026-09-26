// Golden tests: every tool over a real MCP client, replaying DNS-over-HTTPS, IANA, Public Suffix
// List and RDAP responses recorded by test/record.mjs, with the clock at 2026-09-26. No test here
// touches the network.
import assert from "node:assert/strict";
import test from "node:test";
import { call, connect } from "./replay.mjs";
import { LOOKUPS } from "./scenarios.mjs";

test("domain_report: registration, DNS, SPF, DMARC and transport records, with ranked findings", async () => {
  const client = await connect();
  const g = (await call(client, "domain_report", { domain: "Google.com" })).data;
  assert.equal(g.domain, "google.com");
  assert.deepEqual([g.registration.registrar, g.registration.created, g.registration.days_left], ["MarkMonitor Inc.", "1997-09-15", 718]);
  assert.deepEqual(g.spf, { record: "v=spf1 include:_spf.google.com ~all", lookups: 1, all: "~all" });
  assert.equal(g.dmarc.policy, "reject");
  assert.deepEqual([g.mta_sts, g.tls_rpt, g.caa], [true, true, ["pki.goog"]]);
  assert.match(g.bulk_sender_dns, /DKIM not confirmed/, "absence at common selectors is not called missing");
  assert.ok(g.findings.every((f) => f.level === "info"));
  const intel = (await call(client, "domain_report", { domain: "intel.com" })).data;
  assert.equal(intel.findings[0].level, "warning");
  assert.match(intel.findings[0].issue, /p=none/);
  const levels = intel.findings.map((f) => ["error", "warning", "info"].indexOf(f.level));
  assert.deepEqual(levels, [...levels].sort((a, b) => a - b), "errors first");
  const none = await call(client, "domain_report", { domain: "doesnotexist-abc123xyz.com" });
  assert.equal(none.data.error.code, "no_such_domain");
});

test("check_spf: a receiver's verdict for an IP, and the mechanism that decided it", async () => {
  const client = await connect();
  const pass = await call(client, "check_spf", { domain: "gmail.com", ip: "209.85.220.41" });
  assert.equal(pass.data.result, "pass");
  assert.match(pass.data.decided_by, /redirect=_spf\.google\.com -> _spf\.google\.com: ip4:209\.85\.128\.0\/17$/);
  const soft = await call(client, "check_spf", { domain: "gmail.com", ip: "1.2.3.4" });
  assert.deepEqual([soft.data.result, soft.data.decided_by.endsWith("~all")], ["softfail", true]);
  const oracle = await call(client, "check_spf", { domain: "oracle.com" });
  assert.deepEqual([oracle.data.lookups, oracle.data.lookup_limit, oracle.data.problems], [10, 10, undefined], "exactly at the limit is still valid");
  assert.equal(oracle.data.tree.includes.length, 6);
  const bad = await call(client, "check_spf", { domain: "gmail.com", ip: "999.1.1.1" });
  assert.equal(bad.data.error.code, "bad_ip");
});

test("check_dkim: named selectors report found and not found; without selectors, common ones are tried", async () => {
  const client = await connect();
  const gh = await call(client, "check_dkim", { domain: "github.com", selectors: ["google", "selector1", "nope"] });
  assert.deepEqual(gh.data.found.map((k) => [k.selector, k.key_bits]), [["google", 2048], ["selector1", 1024]]);
  assert.match(gh.data.found[1].note, /2048 bits is the current recommendation/);
  assert.deepEqual(gh.data.not_found, ["nope"]);
  const stripe = await call(client, "check_dkim", { domain: "stripe.com" });
  assert.equal(stripe.data.checked, 30);
  assert.ok(stripe.data.found.some((k) => k.selector === "mandrill"));
});

test("dns_lookup: records with TTLs from two resolvers", async () => {
  const client = await connect();
  const { data } = await call(client, "dns_lookup", { name: "github.com", compare: true });
  assert.deepEqual(data.records.MX, ["0 github-com.mail.protection.outlook.com (ttl 300)"]);
  assert.ok(Array.isArray(data.records.NS), "resolvers agree, so one list");
  assert.ok(data.records.TXT.length <= 26, "capped with a count of the rest");
});

test("domain_lookup: registrable domains, second-level suffixes, unregistered names, TLDs without RDAP", async () => {
  const client = await connect();
  const { data } = await call(client, "domain_lookup", { domains: LOOKUPS });
  const [g, sub, bbc, free, io] = data.results;
  assert.deepEqual([g.registrar, g.expires, g.registrar_iana_id], ["MarkMonitor Inc.", "2028-09-14", "292"]);
  assert.deepEqual([sub.domain, sub.asked], ["google.com", "mail.google.com"], "a subdomain resolves to its registrable domain");
  assert.equal(bbc.domain, "bbc.co.uk", "co.uk is a public suffix, so bbc.co.uk is the domain");
  assert.ok(bbc.nameservers.every((n) => !n.endsWith(".")));
  assert.equal(free.registered, false);
  assert.equal(io.rdap, "unsupported");
});
