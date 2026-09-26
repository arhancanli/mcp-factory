#!/usr/bin/env node
// drug-label: Answers medication questions from the official FDA label text on DailyMed with section-level citations (boxed warning, indications, contraindications, warnings, interactions, pregnancy, dosing), resolves any drug name or NDC through RxNorm, and reports openFDA recalls and shortages.
//
// Tools live in src/tools/, one file each. The kit in src/kit/ is a copy of the factory kit
// (a drift test keeps it identical); it holds the network guard, the result wrapper and the
// stdio and HTTP entry points.
import { readFileSync } from "node:fs";
import { createFetcher, createServer, isMain, start, TtlCache } from "./kit/index.mjs";
import { HOSTS, LIMITS, readSpl } from "./drugs.mjs";
import { findDrug } from "./tools/find-drug.mjs";
import { labelSection } from "./tools/label-section.mjs";
import { recallsShortages } from "./tools/recalls-shortages.mjs";
import { searchLabel } from "./tools/search-label.mjs";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

export const SERVER_NAME = pkg.name;
export const SERVER_VERSION = pkg.version;
export const TOOLS = [findDrug, labelSection, recallsShortages, searchLabel];

export const INSTRUCTIONS =
  "Answers come from official FDA labeling (DailyMed), RxNorm and openFDA, and cite the label used. This is label information, not medical advice: do not use it to diagnose, prescribe or change treatment, and tell the user to confirm with a pharmacist or prescriber. Drug interaction answers are what each label says; a label not mentioning an interaction does not mean there is none.";

const LABEL_TTL_MS = 12 * 3_600_000;

export function createContext({ fetchImpl } = {}) {
  const common = { allowHosts: pkg.factory.allowHosts, userAgent: `${SERVER_NAME}/${SERVER_VERSION} (+${pkg.homepage})`, fetchImpl, limits: LIMITS };
  // NLM asks RxNav users to cache results 12 to 24 hours.
  const fetcher = createFetcher({ ...common, cache: new TtlCache({ ttlMs: LABEL_TTL_MS, maxEntries: 2000 }), timeoutMs: 25_000, attemptTimeoutMs: 10_000 });
  const raw = createFetcher({ ...common, timeoutMs: 40_000, attemptTimeoutMs: 20_000, maxBytes: 20 * 1024 * 1024 });
  const parsed = new TtlCache({ ttlMs: LABEL_TTL_MS, maxEntries: 40 });
  return {
    fetcher,
    /** One label, parsed once and kept (labels run to several megabytes of XML). */
    async labels(setid) {
      const key = setid.toLowerCase();
      const hit = parsed.get(key);
      if (hit) return hit;
      const res = await raw.request(`https://dailymed.nlm.nih.gov/dailymed/services/v2/spls/${encodeURIComponent(key)}.xml`, { accept: "*/*" });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`dailymed answered ${res.status}`);
      const label = readSpl(res.text);
      parsed.set(key, label);
      return label;
    },
  };
}

if (HOSTS.some((h) => !pkg.factory.allowHosts.includes(h))) throw new Error("package.json factory.allowHosts must list every source host");

export function buildServer(ctx = createContext()) {
  return createServer({ name: SERVER_NAME, version: SERVER_VERSION, instructions: INSTRUCTIONS, tools: TOOLS, ctx });
}

if (isMain(import.meta.url)) start(() => buildServer(), SERVER_NAME);
