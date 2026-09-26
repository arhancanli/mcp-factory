#!/usr/bin/env node
// end-of-life: Tells coding agents whether a runtime, framework, database or OS version is still supported: end-of-life and security-support dates, days left, the latest patch and the version to upgrade to, for 470+ products, straight from a project's Dockerfile, .nvmrc, package.json, pyproject.toml, go.mod and CI files.
//
// Tools live in src/tools/, one file each. The kit in src/kit/ is a copy of the factory kit
// (a drift test keeps it identical); it holds the network guard, the result wrapper and the
// stdio and HTTP entry points.
import { readFileSync } from "node:fs";
import { createFetcher, createServer, isMain, start, TtlCache } from "./kit/index.mjs";
import { checkProject } from "./tools/check-project.mjs";
import { checkVersions } from "./tools/check-versions.mjs";
import { productLifecycle } from "./tools/product-lifecycle.mjs";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

export const SERVER_NAME = pkg.name;
export const SERVER_VERSION = pkg.version;
export const TOOLS = [checkProject, checkVersions, productLifecycle];

export const INSTRUCTIONS =
  "Use check_project on a repository's Dockerfile, version files, manifests and CI workflows, check_versions for named versions, and product_lifecycle to pick a version. For a range, the lowest version it allows is checked. Dates come from endoflife.date; confirm critical dates with the vendor.";

export function createContext({ fetchImpl, now } = {}) {
  return {
    now,
    fetcher: createFetcher({
      allowHosts: pkg.factory.allowHosts,
      userAgent: `${SERVER_NAME}/${SERVER_VERSION} (+${pkg.homepage})`,
      cache: new TtlCache({ ttlMs: 12 * 3_600_000, maxEntries: 600 }),
      limits: [{ host: "endoflife.date", perSecond: 8, concurrency: 4 }],
      timeoutMs: 20_000,
      attemptTimeoutMs: 8_000,
      fetchImpl,
    }),
  };
}

export function buildServer(ctx = createContext()) {
  return createServer({ name: SERVER_NAME, version: SERVER_VERSION, instructions: INSTRUCTIONS, tools: TOOLS, ctx });
}

if (isMain(import.meta.url)) start(() => buildServer(), SERVER_NAME);
