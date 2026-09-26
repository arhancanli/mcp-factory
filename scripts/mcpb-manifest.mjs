#!/usr/bin/env node
// node scripts/mcpb-manifest.mjs servers/<name>  > manifest.json
//
// Writes the Claude Desktop bundle manifest for a server, derived from its package.json and its
// live tool list, so the bundle can never list a tool the server does not have.
import { existsSync } from "node:fs";
import path from "node:path";
import { CONFIG, inspectServer, readJson } from "./lib.mjs";

export async function mcpbManifest(serverDir) {
  const pkg = readJson(path.join(serverDir, "package.json"));
  const { tools } = await inspectServer(serverDir);
  const repo = `https://github.com/${CONFIG.githubOwner}/${CONFIG.githubRepo}`;
  return {
    manifest_version: "0.3",
    name: pkg.name,
    display_name: pkg.factory.displayName,
    version: pkg.version,
    description: pkg.description,
    author: { name: CONFIG.author.name, url: CONFIG.author.url },
    repository: { type: "git", url: repo },
    homepage: pkg.homepage,
    documentation: pkg.homepage,
    support: `${repo}/issues`,
    ...(existsSync(path.join(serverDir, "icon.png")) ? { icon: "icon.png" } : {}),
    license: pkg.license,
    keywords: pkg.keywords,
    server: {
      type: "node",
      entry_point: "src/server.mjs",
      mcp_config: { command: "node", args: ["${__dirname}/src/server.mjs"] },
    },
    tools: tools.map((t) => ({ name: t.name, description: t.title })),
    compatibility: { platforms: ["darwin", "win32", "linux"], runtimes: { node: pkg.engines.node } },
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  const dir = path.resolve(process.argv[2] ?? "");
  process.stdout.write(`${JSON.stringify(await mcpbManifest(dir), null, 2)}\n`);
}
