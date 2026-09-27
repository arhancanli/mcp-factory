#!/usr/bin/env node
// config-check: Validates configuration files (JSON, JSON with comments, YAML, TOML) against the schema for their file name from SchemaStore: tsconfig.json, package.json, docker-compose.yml, GitHub workflows, ESLint, Renovate and 1,400+ more. Every error has its line and path, the allowed values, and the property you probably meant for a misspelled key; and any setting can be looked up with its description and allowed values. No key.
//
// Tools live in src/tools/, one file each. The kit in src/kit/ is a copy of the factory kit
// (a drift test keeps it identical); it holds the network guard, the result wrapper and the
// stdio and HTTP entry points.
import { readFileSync } from "node:fs";
import { createFetcher, createServer, isMain, start, TtlCache } from "./kit/index.mjs";
import { configHelp } from "./tools/config-help.mjs";
import { findSchema } from "./tools/find-schema.mjs";
import { validateConfig } from "./tools/validate-config.mjs";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

export const SERVER_NAME = pkg.name;
export const SERVER_VERSION = pkg.version;
export const TOOLS = [validateConfig, configHelp, findSchema];

export const INSTRUCTIONS = "Use validate_config with the files' paths and contents: the schema is chosen from the file name (or pass schema). Use config_help to look up what a setting means and which values it takes, and find_schema to see which schema a file name gets.";

export function createContext({ fetchImpl } = {}) {
  const userAgent = `${SERVER_NAME}/${SERVER_VERSION} (+${pkg.homepage})`;
  // This fetcher reads SchemaStore's catalog; the catalog's own fetcher (src/catalog.mjs) reads
  // schemas from the hosts the catalog lists.
  return {
    userAgent,
    fetchImpl,
    fetcher: createFetcher({ allowHosts: pkg.factory.allowHosts, userAgent, cache: new TtlCache({ ttlMs: 6 * 3_600_000 }), maxBytes: 4 * 1024 * 1024, fetchImpl }),
  };
}

export function buildServer(ctx = createContext()) {
  return createServer({ name: SERVER_NAME, version: SERVER_VERSION, instructions: INSTRUCTIONS, tools: TOOLS, ctx });
}

if (isMain(import.meta.url)) start(() => buildServer(), SERVER_NAME);
