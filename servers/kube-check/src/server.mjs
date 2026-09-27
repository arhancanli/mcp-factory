#!/usr/bin/env node
// kube-check: Checks Kubernetes manifests (YAML or JSON, many documents per file) against the API of the Kubernetes version you run or plan to run, 1.19 to the newest: APIs removed or deprecated there with their replacement, unknown or misspelt fields, wrong types, Pod Security Standards (baseline, restricted) and common risks such as latest tags, missing limits and privileged containers. Every finding has its file, line and fix. No cluster or key needed.
//
// Tools live in src/tools/, one file each. The kit in src/kit/ is a copy of the factory kit
// (a drift test keeps it identical); it holds the network guard, the result wrapper and the
// stdio and HTTP entry points.
import { readFileSync } from "node:fs";
import { createFetcher, createServer, isMain, start, TtlCache } from "./kit/index.mjs";
import { apiVersions } from "./tools/api-versions.mjs";
import { checkManifestsTool } from "./tools/check-manifests.mjs";
import { fieldHelp } from "./tools/field-help.mjs";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

export const SERVER_NAME = pkg.name;
export const SERVER_VERSION = pkg.version;
export const TOOLS = [checkManifestsTool, apiVersions, fieldHelp];

export const INSTRUCTIONS = "Use check_manifests with the manifests' paths and contents (render Helm charts and Kustomize overlays first) and the Kubernetes version the cluster runs or will run. Use api_versions to see which apiVersion a kind needs in a version and when old ones were removed, and field_help to look up what a field means and accepts.";

export function createContext({ fetchImpl } = {}) {
  return {
    // The definitions of a version are 1.5 MB; they are parsed once and kept per version in
    // src/versions.mjs, so the HTTP cache only has to hold the small documents.
    fetcher: createFetcher({
      allowHosts: pkg.factory.allowHosts,
      userAgent: `${SERVER_NAME}/${SERVER_VERSION} (+${pkg.homepage})`,
      cache: new TtlCache({ ttlMs: 6 * 3_600_000, maxEntries: 200 }),
      maxBytes: 8 * 1024 * 1024,
      timeoutMs: 30_000,
      attemptTimeoutMs: 12_000,
      fetchImpl,
    }),
  };
}

export function buildServer(ctx = createContext()) {
  return createServer({ name: SERVER_NAME, version: SERVER_VERSION, instructions: INSTRUCTIONS, tools: TOOLS, ctx });
}

if (isMain(import.meta.url)) start(() => buildServer(), SERVER_NAME);
