#!/usr/bin/env node
// Owner-driven first publish. Every target must qualify before any registry write is attempted.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { CONFIG, ROOT, listServerDirs } from "./lib.mjs";
import { exportServer } from "./export.mjs";
import { assertFactoryReviewed, assertReleaseReady } from "./release-readiness.mjs";
import { assertRegistryKnown, registryVersion } from "../kit/release.mjs";

export function assertReviewedMirror(pkg, tree) {
  const commit = JSON.parse(execFileSync("gh", ["api", `repos/${CONFIG.githubOwner}/${pkg.name}/commits/main`], { encoding: "utf8", timeout: 20_000, maxBuffer: 2 * 1024 * 1024 }));
  if (commit.commit?.tree?.sha !== tree || commit.author?.login !== CONFIG.githubOwner || commit.commit?.verification?.verified !== true) throw new Error(`${pkg.name}: reviewed main must match the exact factory tree and verify its owner signature.`);
}

export async function publishNpm(names, { publish = true } = {}) {
  const reports = [];
  for (const name of names) reports.push(await assertReleaseReady(name));
  if (!publish) return reports;
  assertFactoryReviewed();
  // Verify every independent repository before the first publication in a batch.
  for (const report of reports) assertReviewedMirror({ name: report.package }, report.tree);
  for (let i = 0; i < names.length; i++) {
    const name = names[i];
    const report = reports[i];
    const dir = mkdtempSync(path.join(os.tmpdir(), `npm-${name}-`));
    try {
      exportServer(name, dir);
      const tarball = execFileSync("npm", ["pack", "--silent", "--ignore-scripts"], { cwd: dir, encoding: "utf8" }).trim().split("\n").pop();
      const integrity = `sha512-${createHash("sha512").update(readFileSync(path.join(dir, tarball))).digest("base64")}`;
      if (integrity !== report.packed_integrity) throw new Error("Packed bytes differ from the qualified artifact; repeat the exact packed-install check.");
      const state = assertRegistryKnown(await registryVersion(report.package, report.version));
      if (state.state === "published") {
        if (state.integrity !== integrity) throw new Error(`${report.package}@${report.version} serves different bytes; a new reviewed version is required.`);
        process.stdout.write(`${report.package}@${report.version} is already published with matching bytes\n`);
        continue;
      }
      process.stdout.write(`Publishing qualified ${report.package}@${report.version}; confirm in the npm browser flow when asked.\n`);
      execFileSync("npm", ["publish", tarball, "--access", "public", "--registry=https://registry.npmjs.org"], { cwd: dir, stdio: "inherit" });
      const observed = assertRegistryKnown(await registryVersion(report.package, report.version));
      if (observed.state !== "published" || observed.integrity !== integrity) throw new Error("npm has not confirmed the exact published bytes; stop and verify before continuing.");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
  return reports;
}

if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  const args = process.argv.slice(2);
  const names = args.filter((arg) => arg !== "--dry");
  try {
    const reports = await publishNpm(names.length ? names : listServerDirs().map((dir) => path.basename(dir)), { publish: !args.includes("--dry") });
    process.stdout.write(`${JSON.stringify({ qualified: reports.length, published: !args.includes("--dry") }, null, 2)}\n`);
  } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}
