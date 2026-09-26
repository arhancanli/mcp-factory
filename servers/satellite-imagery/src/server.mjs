#!/usr/bin/env node
// satellite-imagery: Finds the best satellite scenes for a place and time across Earth Search and Microsoft Planetary Computer (Sentinel-2, Landsat, Sentinel-1, NAIP and more), ranked by cloud cover and coverage of your area, with previews, band download links and licences.
//
// Tools live in src/tools/, one file each. The kit in src/kit/ is a copy of the factory kit
// (a drift test keeps it identical); it holds the network guard, the result wrapper and the
// stdio and HTTP entry points.
import { readFileSync } from "node:fs";
import { createFetcher, createServer, isMain, start, TtlCache } from "./kit/index.mjs";
import { HOSTS } from "./stac.mjs";
import { findImagery } from "./tools/find-imagery.mjs";
import { sceneAssets } from "./tools/scene-assets.mjs";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

export const SERVER_NAME = pkg.name;
export const SERVER_VERSION = pkg.version;
export const TOOLS = [findImagery, sceneAssets];

export const INSTRUCTIONS =
  "Use find_imagery to pick scenes of a place and period (it ranks by how much of the area each scene covers, then cloud cover and date), then scene_assets for band files. Give each scene the credit its licence asks for.";

export function createContext({ fetchImpl, now } = {}) {
  return {
    now,
    fetcher: createFetcher({
      allowHosts: pkg.factory.allowHosts,
      userAgent: `${SERVER_NAME}/${SERVER_VERSION} (+${pkg.homepage})`,
      cache: new TtlCache({ ttlMs: 30 * 60_000, maxEntries: 500 }),
      limits: [{ host: "earth-search.aws.element84.com", perSecond: 5, concurrency: 3 }],
      timeoutMs: 30_000,
      attemptTimeoutMs: 12_000,
      fetchImpl,
    }),
  };
}

if (HOSTS.some((h) => !pkg.factory.allowHosts.includes(h))) throw new Error("package.json factory.allowHosts must list every source host");

export function buildServer(ctx = createContext()) {
  return createServer({ name: SERVER_NAME, version: SERVER_VERSION, instructions: INSTRUCTIONS, tools: TOOLS, ctx });
}

if (isMain(import.meta.url)) start(() => buildServer(), SERVER_NAME);
