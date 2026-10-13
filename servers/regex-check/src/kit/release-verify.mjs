#!/usr/bin/env node
// Standalone tagged releases read the owner's reviewed factory certificate before any publish.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { assertRegistryKnown, MAX_EVIDENCE_BYTES, registryVersion, releaseVerdict, sourceSnapshot } from "./release.mjs";

async function remoteFile(ref, file) {
  if (!/^(?:main|[a-f0-9]{40})$/.test(ref) || !/^[a-zA-Z0-9_./-]+$/.test(file) || file.split("/").includes("..")) throw new Error("Invalid factory evidence reference.");
  const response = await fetch(`https://raw.githubusercontent.com/arhancanli/mcp-factory/${ref}/${file}`, {
    redirect: "error", signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Factory release evidence unavailable (${response.status}); publication blocked.`);
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_EVIDENCE_BYTES) throw new Error("Factory release evidence exceeds its bound.");
      chunks.push(value);
    }
  } finally { await reader.cancel(); }
  return Buffer.concat(chunks);
}

export async function verifyStandalone(directory = process.cwd()) {
  const source = sourceSnapshot(directory, { ref: "HEAD" });
  const pkg = JSON.parse(readFileSync(path.join(directory, "package.json"), "utf8"));
  const name = pkg.name?.replace(/-mcp$/, "");
  if (!/^[a-z][a-z0-9-]{1,40}$/.test(name ?? "")) throw new Error("Not a CanliLabs standalone package.");
  const certificate = JSON.parse(await remoteFile("main", `docs/releases/${name}/${source.tree}.json`));
  if (!/^[a-f0-9]{40}$/.test(certificate.factory_commit ?? "")) throw new Error("Certificate must identify its immutable factory evidence commit.");
  const report = await releaseVerdict({ directory, name, source, certificate,
    readEvidence: (file) => remoteFile(certificate.factory_commit, file) });
  if (!report.ready) throw new Error(`Release blocked: ${report.issues.join("; ")}`);
  return report;
}

export async function publishStandalone({ provenance = false } = {}) {
  const report = await verifyStandalone();
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  const tarball = execFileSync("npm", ["pack", "--silent", "--ignore-scripts"], { encoding: "utf8" }).trim().split("\n").pop();
  const integrity = `sha512-${createHash("sha512").update(readFileSync(tarball)).digest("base64")}`;
  if (integrity !== report.packed_integrity) throw new Error("Packed bytes differ from the qualified artifact; publication blocked.");
  const state = assertRegistryKnown(await registryVersion(pkg.name, pkg.version));
  if (state.state === "published") {
    if (state.integrity !== integrity) throw new Error("npm serves different bytes for this version; publish a new reviewed version.");
  } else {
    execFileSync("npm", ["publish", tarball, "--access", "public", "--registry=https://registry.npmjs.org", ...(provenance ? ["--provenance"] : [])], { stdio: "inherit" });
  }
  // A lookup failure after publishing is not a proof of absence or success. Stop on unknowns.
  for (let attempt = 0; attempt < 6; attempt++) {
    const observed = assertRegistryKnown(await registryVersion(pkg.name, pkg.version));
    if (observed.state === "published") {
      if (observed.integrity !== integrity) throw new Error("Published tarball integrity differs.");
      return { ...report, npm_integrity: integrity };
    }
    if (attempt < 5) await new Promise((resolve) => setTimeout(resolve, 10_000));
  }
  throw new Error("npm has not confirmed the published version; later release steps are blocked.");
}

if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  try {
    const result = process.argv.includes("--publish") ? await publishStandalone({ provenance: process.argv.includes("--provenance") }) : await verifyStandalone();
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}
