#!/usr/bin/env node
// actions-check: Checks GitHub Actions workflows the way a reviewer would: every action's version against its latest release, the commit SHA to pin it to, actions still running on deprecated Node runtimes, runner labels GitHub no longer provides, deprecated workflow commands, and script injection or pull_request_target risks, with the line and a fix for each. No key.
//
// Tools live in src/tools/, one file each. The kit in src/kit/ is a copy of the factory kit
// (a drift test keeps it identical); it holds the network guard, the result wrapper and the
// stdio and HTTP entry points.
import { readFileSync } from "node:fs";
import { createFetcher, createServer, isMain, start, TtlCache } from "./kit/index.mjs";
import { actionVersions } from "./tools/action-versions.mjs";
import { checkWorkflows } from "./tools/check-workflows.mjs";
import { runnerLabelsTool } from "./tools/runner-labels.mjs";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

export const SERVER_NAME = pkg.name;
export const SERVER_VERSION = pkg.version;
export const TOOLS = [checkWorkflows, actionVersions, runnerLabelsTool];

export const INSTRUCTIONS = "Use check_workflows with the workflow files' contents for a full review with fixes; action_versions for an action's latest release, its major versions, the SHA of a tag and its runtime. Versions come from the actions' git tags, runtimes from their action.yml, runner labels from GitHub's runner-images list.";

export function createContext({ fetchImpl } = {}) {
  return {
    fetcher: createFetcher({
      allowHosts: pkg.factory.allowHosts,
      userAgent: `${SERVER_NAME}/${SERVER_VERSION} (+${pkg.homepage})`,
      cache: new TtlCache({ ttlMs: 30 * 60_000, maxEntries: 500 }),
      limits: [{ host: "github.com", perSecond: 5, concurrency: 4 }, { host: "raw.githubusercontent.com", perSecond: 20, concurrency: 8 }],
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
