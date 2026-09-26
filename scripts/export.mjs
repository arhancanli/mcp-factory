#!/usr/bin/env node
// node scripts/export.mjs <name> <out-dir> [--ref HEAD]
//
// Writes a server's standalone repository: exactly the COMMITTED files of servers/<name> at a git
// ref, never the working tree (a working-tree export once leaked 70 ignored files into a public
// repository). servers/<name> already holds everything the repository needs (the kit, the
// workflows, the bundle manifest), so the export is a plain git archive and its tree hash equals
// the factory's tree for that directory.
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync } from "node:fs";
import path from "node:path";
import { ROOT } from "./lib.mjs";

const git = (args, opts = {}) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8", ...opts });

/** The git tree id of servers/<name> at a ref; equal tree ids mean byte-identical content. */
export const serverTree = (name, ref = "HEAD") => git(["rev-parse", `${ref}:servers/${name}`]).trim();

/** Fails when servers/<name> has changes that are not committed, so nobody publishes a stale export. */
export function assertCommitted(name) {
  const dirty = git(["status", "--porcelain", "--", `servers/${name}`]).trim();
  if (dirty) throw new Error(`servers/${name} has uncommitted changes; commit them before exporting:\n${dirty}`);
}

export function exportServer(name, outDir, { ref = "HEAD" } = {}) {
  const tree = serverTree(name, ref);
  mkdirSync(outDir, { recursive: true });
  if (readdirSync(outDir).some((f) => f !== ".git")) throw new Error(`${outDir} is not empty`);
  const archive = execFileSync("git", ["archive", "--format=tar", tree], { cwd: ROOT, maxBuffer: 256 * 1024 * 1024 });
  execFileSync("tar", ["-x", "-C", outDir], { input: archive });
  return { tree, files: git(["ls-tree", "-r", "--name-only", tree]).split("\n").filter(Boolean) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  const [name, out] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const refIndex = process.argv.indexOf("--ref");
  const ref = refIndex > 0 ? process.argv[refIndex + 1] : "HEAD";
  if (ref === "HEAD") assertCommitted(name);
  const { tree, files } = exportServer(name, path.resolve(out), { ref });
  process.stdout.write(`exported ${files.length} files of servers/${name} (tree ${tree}) to ${out}\n`);
}
