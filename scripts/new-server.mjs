#!/usr/bin/env node
// npm run new -- <name> --title "..." --description "..." --summary "..." --host api.example.org \
//   --category <category> --instructions "..." [--budget 4000]
//
// Creates servers/<name> from the template, vendors the kit, writes an npm-shrinkwrap.json that pins
// every transitive dependency for npx and Docker users, adds the workspace to the root lockfile, and
// runs the sync so every README (the new one and its related servers) and catalog.json are current.
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { generateServer, listServerDirs, ROOT } from "./lib.mjs";
import { buildCatalog } from "./render.mjs";
import { renderServerReadme } from "./sync.mjs";

export function writeShrinkwrap(serverDir) {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "shrinkwrap-"));
  try {
    copyFileSync(path.join(serverDir, "package.json"), path.join(tmp, "package.json"));
    execFileSync("npm", ["install", "--package-lock-only", "--ignore-scripts", "--omit=dev", "--no-audit", "--no-fund"], { cwd: tmp, stdio: "ignore" });
    renameSync(path.join(tmp, "package-lock.json"), path.join(serverDir, "npm-shrinkwrap.json"));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

/** Writes a server's derived files: its Claude Desktop bundle manifest and its README blocks. */
export async function writeDerived(serverDir) {
  const { mcpbManifest } = await import("./mcpb-manifest.mjs");
  const { mkdirSync } = await import("node:fs");
  mkdirSync(path.join(serverDir, "mcpb"), { recursive: true });
  writeFileSync(path.join(serverDir, "mcpb/manifest.json"), `${JSON.stringify(await mcpbManifest(serverDir), null, 2)}\n`);
  await writeReadme(serverDir);
}

/** Renders one server's README against a catalog that includes it, even when it is outside servers/. */
export async function writeReadme(serverDir) {
  const dirs = listServerDirs();
  const self = path.resolve(serverDir);
  const catalog = await buildCatalog(dirs.includes(self) ? dirs : [...dirs, self]);
  writeFileSync(path.join(serverDir, "README.md"), await renderServerReadme(serverDir, catalog));
}

if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      title: { type: "string" },
      description: { type: "string" },
      summary: { type: "string" },
      host: { type: "string" },
      category: { type: "string" },
      instructions: { type: "string" },
      budget: { type: "string" },
    },
  });
  const dir = generateServer({ name: positionals[0], ...values, budget: values.budget ? Number(values.budget) : undefined });
  writeShrinkwrap(dir);
  // The root lockfile must list the new workspace, or npm ci in CI refuses to install.
  execFileSync("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund"], { cwd: ROOT, stdio: "ignore" });
  execFileSync(process.execPath, [path.join(ROOT, "scripts/sync.mjs")], { cwd: ROOT, stdio: "inherit" });
  process.stdout.write(`Created ${path.relative(process.cwd(), dir)}. Next: replace src/tools/example-lookup.mjs, record fixtures, run npm test.\n`);
}
