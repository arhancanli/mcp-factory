#!/usr/bin/env node
// {{name}}: {{description}}
//
// Tools live in src/tools/, one file each. The kit in src/kit/ is a copy of the factory kit
// (a drift test keeps it identical); it holds the network guard, the result wrapper and the
// stdio and HTTP entry points.
import { readFileSync } from "node:fs";
import { createFetcher, createServer, isMain, start, TtlCache } from "./kit/index.mjs";
import { exampleLookup } from "./tools/example-lookup.mjs";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

export const SERVER_NAME = pkg.name;
export const SERVER_VERSION = pkg.version;
export const TOOLS = [exampleLookup];

export const INSTRUCTIONS = "{{instructions}}";

export function createContext({ fetchImpl } = {}) {
  return {
    fetcher: createFetcher({
      allowHosts: pkg.factory.allowHosts,
      userAgent: `${SERVER_NAME}/${SERVER_VERSION} (+${pkg.homepage})`,
      cache: new TtlCache({ ttlMs: 10 * 60_000 }),
      fetchImpl,
    }),
  };
}

export function buildServer(ctx = createContext()) {
  return createServer({ name: SERVER_NAME, version: SERVER_VERSION, instructions: INSTRUCTIONS, tools: TOOLS, ctx });
}

if (isMain(import.meta.url)) start(() => buildServer(), SERVER_NAME);
