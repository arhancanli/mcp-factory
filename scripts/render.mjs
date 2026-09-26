// scripts/render.mjs
//
// Everything in a README that is derived rather than written: badges, one-click install buttons,
// the tool table, the related-servers block, and catalog.json (the machine-readable index of every
// server, which the related-server links and any future hub server read). npm run sync writes
// them; the gate fails when a README or the catalog is stale.
import path from "node:path";
import { CONFIG, inspectServer, listServerDirs, readJson, renderToolTable } from "./lib.mjs";

export const repoUrl = (pkg) => `https://github.com/${CONFIG.githubOwner}/${pkg.name}`;
export const COLLECTION_URL = `https://github.com/${CONFIG.githubOwner}/${CONFIG.collectionRepo}`;

export function renderBadges(pkg) {
  const repo = `${CONFIG.githubOwner}/${pkg.name}`;
  const n = encodeURIComponent(pkg.name);
  return [
    `[![CI](https://github.com/${repo}/actions/workflows/ci.yml/badge.svg)](https://github.com/${repo}/actions/workflows/ci.yml)`,
    `[![npm](https://img.shields.io/npm/v/${n})](https://www.npmjs.com/package/${n})`,
    `[![downloads](https://img.shields.io/npm/dw/${n})](https://www.npmjs.com/package/${n})`,
    `[![OpenSSF Scorecard](https://api.securityscorecards.dev/projects/github.com/${repo}/badge)](https://scorecard.dev/viewer/?uri=github.com/${repo})`,
    `[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)`,
  ].join("\n");
}

/** One-click install links, each built from the same stdio config so they cannot disagree. */
export function renderInstall(pkg) {
  const key = pkg.name.replace(/-mcp$/, "");
  const config = { command: "npx", args: ["-y", pkg.name] };
  const cursor = `https://cursor.com/en/install-mcp?name=${encodeURIComponent(key)}&config=${encodeURIComponent(Buffer.from(JSON.stringify(config)).toString("base64"))}`;
  const vscode = `https://insiders.vscode.dev/redirect/mcp/install?name=${encodeURIComponent(key)}&config=${encodeURIComponent(JSON.stringify(config))}`;
  const goose = `https://block.github.io/goose/extension?cmd=npx&arg=-y&arg=${encodeURIComponent(pkg.name)}&id=${encodeURIComponent(key)}&name=${encodeURIComponent(pkg.factory.displayName)}&description=${encodeURIComponent(pkg.description)}`;
  const desktop = `${repoUrl(pkg)}/releases/latest`;
  return [
    `[![Install in Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](${cursor})`,
    `[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install_Server-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](${vscode})`,
    `[![Install in Goose](https://block.github.io/goose/img/extension-install-dark.svg)](${goose})`,
    "",
    "Needs Node.js 20 or newer. No account or key.",
    "",
    "**Claude Code**",
    "",
    "```sh",
    `claude mcp add ${key} -- npx -y ${pkg.name}`,
    "```",
    "",
    `**Claude Desktop**: download \`${pkg.name}-<version>.mcpb\` from the [latest release](${desktop}) and open it. The bundle is signed; verify it with \`gh attestation verify <file> --repo ${CONFIG.githubOwner}/${pkg.name}\`.`,
    "",
    "**Any other client** (Windsurf, Zed, Cline, Continue and others), in its MCP config file:",
    "",
    "```json",
    JSON.stringify({ mcpServers: { [key]: config } }, null, 2),
    "```",
    "",
    "**Docker**",
    "",
    "```sh",
    `docker build -t ${pkg.name} ${repoUrl(pkg)}.git && docker run -i --rm ${pkg.name}`,
    "```",
    "",
    "**Hosted (Streamable HTTP)**: `node src/server.mjs --http` serves stateless MCP at `POST /mcp` (port from `PORT`, default 3000).",
  ].join("\n");
}

/** catalog.json: every server, its tools and where to get it. Sorted, so it diffs cleanly. */
export async function buildCatalog(dirs = listServerDirs()) {
  const servers = [];
  for (const dir of dirs) {
    const pkg = readJson(path.join(dir, "package.json"));
    const reg = readJson(path.join(dir, "server.json"));
    const { tools } = await inspectServer(dir);
    servers.push({
      name: pkg.name,
      title: pkg.factory.displayName,
      category: pkg.factory.category,
      summary: reg.description,
      description: pkg.description,
      version: pkg.version,
      repository: repoUrl(pkg),
      npm: `https://www.npmjs.com/package/${pkg.name}`,
      mcpName: pkg.mcpName,
      hosts: pkg.factory.allowHosts,
      tools: tools.map((t) => ({ name: t.name, title: t.title })),
    });
  }
  servers.sort((a, b) => a.name.localeCompare(b.name));
  return { schema: "arhancanli.mcp-catalog.v1", owner: CONFIG.author.name, collection: COLLECTION_URL, servers };
}

export const MAX_RELATED = 8;

/** Related servers: same category first, then the rest, capped, with a link to the full list. */
export function renderFamily(catalog, selfName) {
  const self = catalog.servers.find((s) => s.name === selfName);
  const others = catalog.servers.filter((s) => s.name !== selfName);
  const ranked = [...others.filter((s) => s.category === self?.category), ...others.filter((s) => s.category !== self?.category)].slice(0, MAX_RELATED);
  const lines = ranked.map((s) => `- [${s.title}](${s.repository}): ${s.summary}`);
  const rest = others.length - ranked.length;
  lines.push(`- [The whole collection](${COLLECTION_URL}#servers)${rest > 0 ? `, ${rest} more` : ""}`);
  return lines.join("\n");
}

/** The root README's list, grouped by category in config order. */
export function renderCollection(catalog) {
  if (!catalog.servers.length) return "None published yet.";
  const out = [];
  for (const [key, label] of Object.entries(CONFIG.categories)) {
    const inCat = catalog.servers.filter((s) => s.category === key);
    if (!inCat.length) continue;
    out.push(`### ${label}`, "", "| Server | What it does | Run |", "| --- | --- | --- |");
    for (const s of inCat) out.push(`| [${s.title}](${s.repository}) | ${s.summary} | \`npx -y ${s.name}\` |`);
    out.push("");
  }
  return out.join("\n").trimEnd();
}

export { renderToolTable };
