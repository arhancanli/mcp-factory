#!/usr/bin/env node
// release-notes: Answers upgrade questions from a package's own changelog or GitHub releases: what changed between two versions, with breaking changes, deprecations, security fixes and raised requirements pulled out first; the notes for one version; and the version where something was added, deprecated or removed. npm, PyPI, crates.io, RubyGems, Go and Packagist. No key.
//
// Tools live in src/tools/, one file each. The kit in src/kit/ is a copy of the factory kit
// (a drift test keeps it identical); it holds the network guard, the result wrapper and the
// stdio and HTTP entry points.
import { readFileSync } from "node:fs";
import { createFetcher, createServer, isMain, start, TtlCache } from "./kit/index.mjs";
import { changesBetween } from "./tools/changes-between.mjs";
import { releaseNotes } from "./tools/release-notes.mjs";
import { searchChangelog } from "./tools/search-changelog.mjs";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

export const SERVER_NAME = pkg.name;
export const SERVER_VERSION = pkg.version;
export const TOOLS = [changesBetween, releaseNotes, searchChangelog];

export const INSTRUCTIONS = "Use changes_between before an upgrade: it lists breaking changes, deprecations, security fixes and requirement changes between two versions. Use release_notes for one version's full notes, and search_changelog to find the version where something was added, deprecated or removed. Answers come from the package's own CHANGELOG file or its GitHub releases; each result names its source.";

export function createContext({ fetchImpl, env = process.env } = {}) {
  return {
    // Optional: GitHub allows 60 anonymous API requests an hour; a token (no scopes) raises it.
    githubToken: env.GITHUB_TOKEN || undefined,
    fetcher: createFetcher({
      allowHosts: pkg.factory.allowHosts,
      userAgent: `${SERVER_NAME}/${SERVER_VERSION} (+${pkg.homepage})`,
      cache: new TtlCache({ ttlMs: 30 * 60_000, maxEntries: 500 }),
      limits: [
        { host: "api.github.com", perSecond: 2, concurrency: 2 },
        { host: "raw.githubusercontent.com", perSecond: 20, concurrency: 6 },
        { host: "api.deps.dev", perSecond: 10, concurrency: 4 },
      ],
      maxBytes: 8 * 1024 * 1024,
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
