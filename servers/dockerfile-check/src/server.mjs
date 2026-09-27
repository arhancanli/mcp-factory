#!/usr/bin/env node
// dockerfile-check: Checks Dockerfiles the way a build and a security review would: syntax, instructions that break or slow the build (apt-get install without -y, copies from outside the context, exec form with single quotes), risky patterns (root user, secrets in ENV or ARG, unpinned images), and every base image against its registry: whether the tag exists (with the nearest real tags when it does not), its digest to pin, the platforms it is built for, when it was last rebuilt, and whether its runtime and OS are past end of life. Docker Hub, GHCR, Quay, GCR, MCR, ECR Public and registry.k8s.io. No key.
//
// Tools live in src/tools/, one file each. The kit in src/kit/ is a copy of the factory kit
// (a drift test keeps it identical); it holds the network guard, the result wrapper and the
// stdio and HTTP entry points.
import { readFileSync } from "node:fs";
import { createFetcher, createServer, isMain, start, TtlCache } from "./kit/index.mjs";
import { checkDockerfileTool } from "./tools/check-dockerfile.mjs";
import { imageInfo } from "./tools/image-info.mjs";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

export const SERVER_NAME = pkg.name;
export const SERVER_VERSION = pkg.version;
export const TOOLS = [checkDockerfileTool, imageInfo];

export const INSTRUCTIONS = "Use check_dockerfile with the Dockerfile's path and content, and the platform you build for when it matters. Use image_info for images named elsewhere (compose files, Kubernetes manifests, CI jobs) to check that tags exist, get digests to pin, and see platforms and end-of-life status.";

// `now` is fixed in tests: support status and "not rebuilt for 180 days" depend on the date.
export function createContext({ fetchImpl, now } = {}) {
  return {
    now: now ?? (() => Date.now()),
    fetcher: createFetcher({
      allowHosts: pkg.factory.allowHosts,
      userAgent: `${SERVER_NAME}/${SERVER_VERSION} (+${pkg.homepage})`,
      // Tags move (node:20-alpine is rebuilt weekly): registry answers are kept for 30 minutes.
      cache: new TtlCache({ ttlMs: 30 * 60_000, maxEntries: 500 }),
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
