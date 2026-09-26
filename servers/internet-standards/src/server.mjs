#!/usr/bin/env node
// internet-standards: RFCs, errata and IANA registries for coding agents: exact section text, status and obsoleted-by chains to the current replacement, errata per section, and protocol registry entries with their defining references.
//
// Tools live in src/tools/, one file each. The kit in src/kit/ is a copy of the factory kit
// (a drift test keeps it identical); it holds the network guard, the result wrapper and the
// stdio and HTTP entry points.
import { readFileSync } from "node:fs";
import { createFetcher, createServer, isMain, start, TtlCache } from "./kit/index.mjs";
import { createStore, HOSTS } from "./data.mjs";
import { ianaLookup } from "./tools/iana-lookup.mjs";
import { rfcInfo } from "./tools/rfc-info.mjs";
import { rfcSection } from "./tools/rfc-section.mjs";
import { searchRfcs } from "./tools/search-rfcs.mjs";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

export const SERVER_NAME = pkg.name;
export const SERVER_VERSION = pkg.version;
export const TOOLS = [ianaLookup, rfcInfo, rfcSection, searchRfcs];

export const INSTRUCTIONS =
  "Cite Internet standards from these tools, not from memory. Before relying on an RFC, check rfc_info: an obsolete RFC lists the documents that replace it today. Quote requirements with rfc_section, which returns the published text verbatim with the verified errata for that section. Use iana_lookup for registered values (status codes, headers, media types, ports, cipher suites).";

export function createContext({ fetchImpl } = {}) {
  const common = { allowHosts: pkg.factory.allowHosts, userAgent: `${SERVER_NAME}/${SERVER_VERSION} (+${pkg.homepage})`, fetchImpl };
  return {
    store: createStore({
      small: createFetcher({ ...common, cache: new TtlCache({ ttlMs: 6 * 3_600_000, maxEntries: 2000 }), timeoutMs: 20_000, attemptTimeoutMs: 6_000 }),
      // The RFC index and the errata export are 13.7 MB and 11.7 MB uncompressed.
      big: createFetcher({ ...common, maxBytes: 32 * 1024 * 1024, timeoutMs: 60_000, attemptTimeoutMs: 25_000 }),
    }),
  };
}

if (HOSTS.some((h) => !pkg.factory.allowHosts.includes(h))) throw new Error("package.json factory.allowHosts must list every source host");

export function buildServer(ctx = createContext()) {
  return createServer({ name: SERVER_NAME, version: SERVER_VERSION, instructions: INSTRUCTIONS, tools: TOOLS, ctx });
}

if (isMain(import.meta.url)) start(() => buildServer(), SERVER_NAME);
