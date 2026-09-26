#!/usr/bin/env node
// npm run sync: copies the canonical kit and the standalone-repo scaffolding into every server,
// writes each server's Claude Desktop bundle manifest, then regenerates everything derived:
// each README's badges, install buttons, tool table and related servers, catalog.json, and the
// root README's collection list. Run it after changing kit/, a tool, or adding a server; the gate
// fails until you do.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { inspectServer, listServerDirs, readJson, replaceBlock, ROOT, syncKit, syncRepoFiles } from "./lib.mjs";
import { mcpbManifest } from "./mcpb-manifest.mjs";
import { buildCatalog, renderBadges, renderCollection, renderFamily, renderInstall, renderToolTable } from "./render.mjs";

export async function renderServerReadme(dir, catalog) {
  const pkg = readJson(path.join(dir, "package.json"));
  const { tools } = await inspectServer(dir);
  let text = readFileSync(path.join(dir, "README.md"), "utf8");
  text = replaceBlock(text, "badges", renderBadges(pkg));
  text = replaceBlock(text, "install", renderInstall(pkg));
  text = replaceBlock(text, "tools", renderToolTable(tools));
  text = replaceBlock(text, "family", renderFamily(catalog, pkg.name));
  return text;
}

export const catalogText = (catalog) => `${JSON.stringify(catalog, null, 2)}\n`;

if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  const dirs = listServerDirs();
  for (const dir of dirs) {
    syncKit(dir);
    syncRepoFiles(dir);
    mkdirSync(path.join(dir, "mcpb"), { recursive: true });
    writeFileSync(path.join(dir, "mcpb/manifest.json"), `${JSON.stringify(await mcpbManifest(dir), null, 2)}\n`);
  }
  const catalog = await buildCatalog(dirs);
  writeFileSync(path.join(ROOT, "catalog.json"), catalogText(catalog));
  for (const dir of dirs) {
    writeFileSync(path.join(dir, "README.md"), await renderServerReadme(dir, catalog));
    process.stdout.write(`synced ${path.relative(ROOT, dir)}\n`);
  }
  const root = path.join(ROOT, "README.md");
  writeFileSync(root, replaceBlock(readFileSync(root, "utf8"), "servers", renderCollection(catalog)));
}
