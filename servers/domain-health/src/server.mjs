#!/usr/bin/env node
// domain-health: Checks a domain the way mail providers and registrars see it: SPF evaluated in full (the 10-lookup limit, void lookups, whether an IP may send), DKIM keys and their strength, DMARC policy with the DNS tree walk, MTA-STS, TLS-RPT, BIMI, CAA, DNS records from two resolvers, and registration data from the registry's RDAP server. No key.
//
// Tools live in src/tools/, one file each. The kit in src/kit/ is a copy of the factory kit
// (a drift test keeps it identical); it holds the network guard, the result wrapper and the
// stdio and HTTP entry points.
import { readFileSync } from "node:fs";
import { createFetcher, createServer, isMain, start, TtlCache } from "./kit/index.mjs";
import { checkDkim } from "./tools/check-dkim.mjs";
import { checkSpfTool } from "./tools/check-spf.mjs";
import { dnsLookup } from "./tools/dns-lookup.mjs";
import { domainLookup } from "./tools/domain-lookup.mjs";
import { domainReport } from "./tools/domain-report.mjs";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

export const SERVER_NAME = pkg.name;
export const SERVER_VERSION = pkg.version;
export const TOOLS = [domainReport, checkSpfTool, checkDkim, dnsLookup, domainLookup];

export const INSTRUCTIONS = "Start with domain_report for an overview with ranked findings and fixes. Use check_spf to evaluate SPF (optionally for a sending IP), check_dkim for DKIM selectors, dns_lookup for raw records, and domain_lookup for registration, expiry and availability.";

export function createContext({ fetchImpl, now } = {}) {
  const userAgent = `${SERVER_NAME}/${SERVER_VERSION} (+${pkg.homepage})`;
  return {
    now,
    userAgent,
    fetchImpl, // the RDAP fetcher (built from IANA's bootstrap) uses it too
    fetcher: createFetcher({
      allowHosts: pkg.factory.allowHosts,
      userAgent,
      // Short: people check DNS right after changing it.
      cache: new TtlCache({ ttlMs: 30_000, maxEntries: 2000 }),
      limits: [
        { host: "cloudflare-dns.com", perSecond: 40, concurrency: 12 },
        { host: "dns.google", perSecond: 20, concurrency: 8 },
      ],
      timeoutMs: 15_000,
      attemptTimeoutMs: 5_000,
      fetchImpl,
    }),
  };
}

export function buildServer(ctx = createContext()) {
  return createServer({ name: SERVER_NAME, version: SERVER_VERSION, instructions: INSTRUCTIONS, tools: TOOLS, ctx });
}

if (isMain(import.meta.url)) start(() => buildServer(), SERVER_NAME);
