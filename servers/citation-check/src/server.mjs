#!/usr/bin/env node
// citation-check: Checks reference lists and BibTeX against Crossref, OpenAlex, arXiv, PubMed and DataCite: flags fabricated or mismatched citations field by field, flags retractions, and returns corrected BibTeX with DOIs.
//
// Tools live in src/tools/, one file each. The kit in src/kit/ is a copy of the factory kit
// (a drift test keeps it identical); it holds the network guard, the result wrapper and the
// stdio and HTTP entry points.
import { readFileSync } from "node:fs";
import { createFetcher, createServer, isMain, start, TtlCache } from "./kit/index.mjs";
import { HOSTS, limits } from "./sources.mjs";
import { checkReferences } from "./tools/check-references.mjs";
import { checkRetractions } from "./tools/check-retractions.mjs";
import { lookupWork } from "./tools/lookup-work.mjs";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

export const SERVER_NAME = pkg.name;
export const SERVER_VERSION = pkg.version;
export const TOOLS = [checkReferences, checkRetractions, lookupWork];

export const INSTRUCTIONS =
  "Use check_references on any reference list or BibTeX before citing it, submitting it or trusting it; use lookup_work to resolve one citation or identifier and get clean BibTeX; use check_retractions for a fast retraction check of DOIs. not_found means no indexed source holds the work: it may be fabricated, or be a book, thesis or very new work that is not indexed.";

// Optional, set by the user: CROSSREF_MAILTO (their own email) moves Crossref requests to its
// faster "polite" pool; OPENALEX_API_KEY raises OpenAlex's daily search allowance.
export function createContext({ fetchImpl, env = process.env } = {}) {
  const mailto = env.CROSSREF_MAILTO && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.CROSSREF_MAILTO) ? env.CROSSREF_MAILTO : "";
  return {
    mailto: mailto ? `&mailto=${encodeURIComponent(mailto)}` : "",
    openalexKey: env.OPENALEX_API_KEY || "",
    fetcher: createFetcher({
      allowHosts: pkg.factory.allowHosts,
      userAgent: `${SERVER_NAME}/${SERVER_VERSION} (+${pkg.homepage})`,
      cache: new TtlCache({ ttlMs: 30 * 60_000 }),
      limits: limits({ polite: Boolean(mailto) }),
      timeoutMs: 45_000,
      fetchImpl,
    }),
  };
}

if (HOSTS.some((h) => !pkg.factory.allowHosts.includes(h))) throw new Error("package.json factory.allowHosts must list every source host");

export function buildServer(ctx = createContext()) {
  return createServer({ name: SERVER_NAME, version: SERVER_VERSION, instructions: INSTRUCTIONS, tools: TOOLS, ctx });
}

if (isMain(import.meta.url)) start(() => buildServer(), SERVER_NAME);
