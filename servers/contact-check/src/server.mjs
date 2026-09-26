#!/usr/bin/env node
// contact-check: Checks contact data the way a careful form would: phone numbers parsed, validated and formatted for their country with their type (mobile, fixed, toll-free), email addresses checked for syntax, a domain that accepts mail, disposable providers and likely typos, and postal addresses against each country's required fields, postcode pattern and regions, formatted as that country writes them. No key.
//
// Tools live in src/tools/, one file each. The kit in src/kit/ is a copy of the factory kit
// (a drift test keeps it identical); it holds the network guard, the result wrapper and the
// stdio and HTTP entry points.
import { readFileSync } from "node:fs";
import { createFetcher, createServer, isMain, start, TtlCache } from "./kit/index.mjs";
import { checkAddresses } from "./tools/check-addresses.mjs";
import { checkEmails } from "./tools/check-emails.mjs";
import { checkPhones } from "./tools/check-phones.mjs";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

export const SERVER_NAME = pkg.name;
export const SERVER_VERSION = pkg.version;
export const TOOLS = [checkPhones, checkEmails, checkAddresses];

export const INSTRUCTIONS = "Use check_phones, check_emails and check_addresses on lists (up to 100 at a time); each result says valid or not, why, and the normalised form (E.164, lowercased domain, the country's address label). Phone checks are offline; email checks ask DNS whether the domain accepts mail.";

export function createContext({ fetchImpl } = {}) {
  return {
    fetcher: createFetcher({
      allowHosts: pkg.factory.allowHosts,
      userAgent: `${SERVER_NAME}/${SERVER_VERSION} (+${pkg.homepage})`,
      cache: new TtlCache({ ttlMs: 30 * 60_000, maxEntries: 2000 }),
      limits: [{ host: "cloudflare-dns.com", perSecond: 40, concurrency: 12 }],
      fetchImpl,
    }),
  };
}

export function buildServer(ctx = createContext()) {
  return createServer({ name: SERVER_NAME, version: SERVER_VERSION, instructions: INSTRUCTIONS, tools: TOOLS, ctx });
}

if (isMain(import.meta.url)) start(() => buildServer(), SERVER_NAME);
