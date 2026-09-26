import { z } from "zod";
import { compact, defineTool, mapLimit, ToolError } from "../kit/index.mjs";
import { mx as mxLookup, normName, query } from "../dns.mjs";
import { caa, dkimSelector, dmarc, transportRecords } from "../mail.mjs";
import { lookupDomain } from "../rdap.mjs";
import { checkSpf, LOOKUP_LIMIT, treeIssues } from "../spf.mjs";
import { domainInput, READ_ONLY } from "./shared.mjs";

// The selectors most mail is signed with (Google Workspace, Microsoft 365, and the large senders).
const REPORT_SELECTORS = ["google", "selector1", "selector2", "default", "k1", "s1", "s2", "dkim", "resend", "mandrill", "sig1", "protonmail"];
const LEVELS = ["error", "warning", "info"];

export const domainReport = defineTool({
  name: "domain_report",
  title: "Domain and email health report",
  description:
    "One-call health check of a domain: registration and expiry, name servers, MX, SPF (lookups, policy), DMARC, DKIM at common selectors, MTA-STS, TLS-RPT, BIMI, CAA, DNSSEC, and whether it meets Gmail and Yahoo bulk-sender DNS rules, with ranked findings and fixes.",
  input: { domain: domainInput },
  output: { domain: z.string(), findings: z.array(z.looseObject({ level: z.string(), issue: z.string() })) },
  annotations: READ_ONLY,
  handler: async ({ domain: raw }, ctx) => {
    const domain = normName(raw);
    const safe = (p) => p.catch((err) => (err instanceof ToolError ? { failed: err.message } : Promise.reject(err)));
    const [reg, ns, mx, soa, spf, dm, dkim, transport, caaRec] = await Promise.all([
      safe(lookupDomain(ctx, domain)),
      query(ctx, domain, "NS"),
      mxLookup(ctx, domain),
      query(ctx, domain, "SOA"),
      checkSpf(ctx, domain),
      dmarc(ctx, domain),
      mapLimit(REPORT_SELECTORS, 12, (s) => dkimSelector(ctx, domain, s)),
      transportRecords(ctx, domain),
      caa(ctx, domain),
    ]);
    if (soa.status === "NXDOMAIN" && !mx.hosts.length) throw new ToolError("no_such_domain", `${domain} does not exist in DNS.${reg?.registered === false ? " It is not registered." : ""}`);
    const findings = [];
    const add = (level, issue, fix) => findings.push(compact({ level, issue, fix }));
    const nullMx = mx.hosts.length === 1 && mx.hosts[0].host === "" && mx.hosts[0].priority === 0;
    const receives = mx.hosts.length > 0 && !nullMx;
    const keys = dkim.filter((k) => k.found);

    // Registration
    if (reg?.registered && reg.days_left !== undefined) {
      if (reg.days_left < 0) add("error", `Registration expired ${-reg.days_left} days ago (${reg.expires}).`, "Renew at the registrar now.");
      else if (reg.days_left < 30) add("error", `Registration expires in ${reg.days_left} days (${reg.expires}).`, "Renew, or turn on auto-renew.");
      else if (reg.days_left < 60) add("warning", `Registration expires in ${reg.days_left} days (${reg.expires}).`, "Check auto-renew is on.");
    }
    const holds = (reg?.status ?? []).filter((s) => /hold/i.test(s));
    if (holds.length) add("error", `Registry status ${holds.join(", ")}: the domain does not resolve.`, "Contact the registrar.");

    // SPF
    const spfIssues = [...spf.problems, ...treeIssues(spf.tree).filter((x) => !spf.problems.some((p) => x.endsWith(p)))];
    const all = spf.tree.all ?? spf.tree.redirect?.all;
    if (!spf.tree.record && !spf.tree.records) {
      if (receives || keys.length)
        add("error", "No SPF record: receivers cannot tell which servers may send as this domain.", "Publish one TXT record at the domain: v=spf1 include:<your mail provider> -all");
      else add("warning", "No SPF record, and the domain receives no mail.", "If it sends no mail, publish v=spf1 -all so nobody can send as it.");
    } else if (spfIssues.length)
      add(
        "error",
        `SPF: ${spfIssues.join("; ")}.`,
        spf.lookups > LOOKUP_LIMIT ? "Remove unused includes or replace some with ip4/ip6 ranges to get under 10 lookups." : "Fix the record so it parses; SPF fails for all mail until then.",
      );
    else if (spf.lookups >= LOOKUP_LIMIT - 1) add("warning", `SPF uses ${spf.lookups} of ${LOOKUP_LIMIT} DNS lookups.`, "One more include will break SPF; trim includes now.");
    if (/^\+?all$/i.test(all ?? "")) add("error", "SPF ends in +all: any server may send as this domain.", "End the record with ~all or -all.");
    else if (spf.tree.record && (!all || /^\?all$/i.test(all)))
      add(
        "warning",
        `SPF ends ${all ? "in ?all" : "without an all mechanism"}: mail from other servers is not flagged.`,
        "End the record with ~all (or -all once you are sure every sender is listed).",
      );

    // DMARC
    if (!dm)
      add(
        "error",
        "No DMARC record: spoofed mail is not rejected, and Gmail and Yahoo require one from bulk senders.",
        `Publish TXT at _dmarc.${domain}: v=DMARC1; p=none; rua=mailto:dmarc@${domain}`,
      );
    else {
      if (dm.error || dm.problems) add("error", `DMARC: ${dm.error ?? dm.problems.join("; ")}.`, "Fix the record; receivers ignore an invalid one.");
      if (dm.policy === "none") add("warning", "DMARC policy is p=none: reports only; spoofed mail is still delivered.", "After reviewing reports, move to p=quarantine, then p=reject.");
      if (!dm.reports && !dm.error) add("warning", "DMARC has no rua= address, so no aggregate reports arrive.", `Add rua=mailto:dmarc@${domain} (or a report service's address).`);
      if (dm.pct !== undefined && dm.pct < 100) add("info", `DMARC applies to ${dm.pct}% of failing mail (pct=${dm.pct}).`);
    }

    // DKIM
    const weak = keys.filter((k) => k.problems);
    for (const k of weak) add("error", `DKIM ${k.selector}: ${k.problems.join("; ")}.`, "Publish a 2048-bit key and rotate the selector.");
    if (!keys.length)
      add(
        "info",
        `No DKIM key at ${REPORT_SELECTORS.length} common selectors. Senders that sign use their own selector.`,
        "Check with check_dkim and the selector from a sent message (DKIM-Signature s=).",
      );

    // Transport and certificates
    if (receives && !transport.mta_sts)
      add("info", "No MTA-STS: mail to this domain can be downgraded to unencrypted in transit.", "Publish a _mta-sts TXT record, and serve the policy over HTTPS at mta-sts.<domain>/.well-known/mta-sts.txt.");
    if (receives && !transport.tls_rpt) add("info", "No TLS-RPT record, so delivery TLS failures are not reported.", `Publish TXT at _smtp._tls.${domain}: v=TLSRPTv1; rua=mailto:tls@${domain}`);
    if (!caaRec) add("info", "No CAA record: any certificate authority may issue certificates for this domain.", 'Publish CAA records naming your CA, e.g. 0 issue "letsencrypt.org".');
    if (!receives && !nullMx) add("info", "No MX records: the domain does not receive mail.");

    // Gmail and Yahoo's DNS rules for bulk senders: SPF, DKIM and DMARC. DKIM can only be proven
    // present (selectors are not listable), so its absence at common selectors is "not confirmed".
    const bulk = [];
    if (!spf.tree.record || spfIssues.length) bulk.push("a valid SPF record");
    if (!dm || dm.error || dm.problems) bulk.push("a valid DMARC record");
    const bulkText = bulk.length ? `missing ${bulk.join(" and ")}` : keys.length ? "meets the SPF, DKIM and DMARC requirements" : "SPF and DMARC meet the requirements; DKIM not confirmed (no key at common selectors)";
    findings.sort((a, b) => LEVELS.indexOf(a.level) - LEVELS.indexOf(b.level));
    // findings stays outside compact(), which would drop an empty list (a clean domain).
    return {
      ...compact({
        domain,
        registration: reg?.failed
          ? { unavailable: reg.failed }
          : reg &&
            compact({
              registrar: reg.registrar,
              created: reg.created,
              expires: reg.expires,
              days_left: reg.days_left,
              registered: reg.registered === false ? false : undefined,
              dnssec: reg.dnssec,
              rdap: reg.rdap,
            }),
        nameservers: ns.answers.map((a) => a.data),
        dnssec_validated: soa.ad || ns.ad || undefined,
        mx: nullMx ? "null MX (receives no mail)" : mx.hosts.map((h) => `${h.priority} ${h.host}`),
        spf: spf.tree.record ? compact({ record: spf.tree.record, lookups: spf.lookups, all }) : null,
        dmarc: dm ? compact({ policy: dm.policy, subdomain_policy: dm.subdomain_policy, at: dm.inherited ? `_dmarc.${dm.at}` : undefined, reports: dm.reports?.length ?? 0, pct: dm.pct }) : null,
        dkim: keys.map((k) => `${k.selector} (${k.key_type}${k.key_bits ? ` ${k.key_bits}` : ""}${k.testing ? ", testing" : ""})`),
        mta_sts: transport.mta_sts ? true : undefined,
        tls_rpt: transport.tls_rpt ? true : undefined,
        bimi: transport.bimi ?? undefined,
        caa: caaRec?.issuers,
        bulk_sender_dns: bulkText,
      }),
      findings,
    };
  },
});
