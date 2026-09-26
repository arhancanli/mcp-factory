#!/usr/bin/env node
// license-check: Answers open source license questions from authoritative data: the SPDX identifier for any way a license is written, whether it is OSI approved and copyleft, and whether a dependency's license can be combined with your project's (OSADL's compatibility matrix, with the reason), for SPDX expressions with OR, AND and exceptions, and for whole dependency lists via deps.dev. Not legal advice. No key.
//
// Tools live in src/tools/, one file each. The kit in src/kit/ is a copy of the factory kit
// (a drift test keeps it identical); it holds the network guard, the result wrapper and the
// stdio and HTTP entry points.
import { readFileSync } from "node:fs";
import { createFetcher, createServer, isMain, start, TtlCache } from "./kit/index.mjs";
import { checkCompatibility } from "./tools/check-compatibility.mjs";
import { licenseInfo } from "./tools/license-info.mjs";
import { packageLicenses } from "./tools/package-licenses.mjs";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

export const SERVER_NAME = pkg.name;
export const SERVER_VERSION = pkg.version;
export const TOOLS = [checkCompatibility, packageLicenses, licenseInfo];

export const INSTRUCTIONS = "Use check_compatibility with your project's license and the licenses (or SPDX expressions) of what you include; package_licenses looks up the licenses of packages and checks them in one call; license_info identifies a license from how it is written. Verdicts come from OSADL's matrix: 'yes', 'no', or 'check' where it depends on how the code is combined. Not legal advice.";

export function createContext({ fetchImpl } = {}) {
  return {
    fetcher: createFetcher({
      allowHosts: pkg.factory.allowHosts,
      userAgent: `${SERVER_NAME}/${SERVER_VERSION} (+${pkg.homepage})`,
      cache: new TtlCache({ ttlMs: 60 * 60_000, maxEntries: 500 }),
      // OSADL's matrix with reasons is 3.5 MB.
      maxBytes: 8 * 1024 * 1024,
      timeoutMs: 30_000,
      fetchImpl,
    }),
  };
}

export function buildServer(ctx = createContext()) {
  return createServer({ name: SERVER_NAME, version: SERVER_VERSION, instructions: INSTRUCTIONS, tools: TOOLS, ctx });
}

if (isMain(import.meta.url)) start(() => buildServer(), SERVER_NAME);
