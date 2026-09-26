#!/usr/bin/env node
// node scripts/publish-npm.mjs [name...]
//
// First npm publish of each server, run by the owner (npm asks for a browser confirmation per
// publish). Each package is published from an export of its committed files, never the working
// tree; versions already on npm are skipped. Later releases come from each repository's CI
// (release.yml, with provenance) once its npm Trusted Publisher is set up.
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { listServerDirs, readJson } from "./lib.mjs";
import { assertCommitted, exportServer } from "./export.mjs";

const names = process.argv.slice(2).length ? process.argv.slice(2) : listServerDirs().map((d) => path.basename(d));
for (const name of names) {
  assertCommitted(name);
  const pkg = readJson(path.join(listServerDirs().find((d) => path.basename(d) === name), "package.json"));
  let published = false;
  try {
    published = execFileSync("npm", ["view", `${pkg.name}@${pkg.version}`, "version"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() === pkg.version;
  } catch {}
  if (published) {
    process.stdout.write(`${pkg.name}@${pkg.version} is already on npm\n`);
    continue;
  }
  const dir = mkdtempSync(path.join(os.tmpdir(), `npm-${name}-`));
  try {
    exportServer(name, dir);
    process.stdout.write(`\nPublishing ${pkg.name}@${pkg.version} (confirm in the browser when npm asks)\n`);
    const r = spawnSync("npm", ["publish", "--access", "public"], { cwd: dir, stdio: "inherit" });
    if (r.status !== 0) {
      process.stdout.write(`npm publish failed for ${pkg.name}; stopping.\n`);
      process.exit(1);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
process.stdout.write("\nDone. Next: on npmjs.com, each package > Settings > Trusted Publisher > GitHub Actions: owner arhancanli, repository <package name>, workflow release.yml, environment release.\n");
