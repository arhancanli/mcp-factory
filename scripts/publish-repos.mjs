#!/usr/bin/env node
// node scripts/publish-repos.mjs [name...] [--public] [--dry]
//
// Mirrors each server to its own repository, github.com/<owner>/<package name>. For each server:
// creates the repository if it does not exist (PRIVATE unless --public is given), replaces its
// content with the committed tree of servers/<name>, commits as the owner with the owner's SSH
// signature, pushes, then proves parity: the pushed commit's tree id must equal the factory's tree
// id for servers/<name>. Equal tree ids mean every file is byte-identical and nothing extra exists.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { CONFIG, listServerDirs, readJson, ROOT } from "./lib.mjs";
import { assertCommitted, exportServer, serverTree } from "./export.mjs";

const OWNER_EMAIL = "315329124+arhancanli@users.noreply.github.com";
const SIGNING_KEY = path.join(os.homedir(), ".ssh/git_signing_ed25519.pub");

const sh = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const exists = (repo) => {
  try {
    sh("gh", ["repo", "view", repo, "--json", "name"]);
    return true;
  } catch {
    return false;
  }
};

/** GitHub topics: the shared collection topic (one topic page lists every server), the MCP topics,
 * the category and the package keywords; GitHub allows 20, lowercase letters, digits and dashes. */
export function repoTopics(pkg) {
  const all = [CONFIG.collectionTopic, "mcp", "mcp-server", "model-context-protocol", pkg.factory.category, ...(pkg.keywords ?? [])];
  return [...new Set(all.map((t) => String(t).toLowerCase().replace(/[^a-z0-9-]/g, "-")).filter((t) => /^[a-z0-9][a-z0-9-]{0,49}$/.test(t)))].slice(0, 20);
}

export function publishServer(name, { makePublic = false, dry = false } = {}) {
  assertCommitted(name);
  const dir = path.join(ROOT, "servers", name);
  const pkg = readJson(path.join(dir, "package.json"));
  const reg = readJson(path.join(dir, "server.json"));
  const repo = `${CONFIG.githubOwner}/${pkg.name}`;
  const factorySha = sh("git", ["rev-parse", "HEAD"], ROOT);
  const tree = serverTree(name);
  if (dry) return { repo, tree, action: exists(repo) ? "would update" : "would create" };

  if (!exists(repo)) {
    sh("gh", ["repo", "create", repo, makePublic ? "--public" : "--private", "--description", reg.description, "--homepage", `https://www.npmjs.com/package/${pkg.name}`, "--disable-wiki"]);
  }
  const work = mkdtempSync(path.join(os.tmpdir(), `publish-${name}-`));
  try {
    const clone = path.join(work, "repo");
    sh("gh", ["repo", "clone", repo, clone, "--", "--quiet"]);
    for (const [k, v] of [["user.name", CONFIG.author.name], ["user.email", OWNER_EMAIL], ["gpg.format", "ssh"], ["user.signingkey", SIGNING_KEY], ["commit.gpgsign", "true"]]) {
      sh("git", ["config", k, v], clone);
    }
    for (const entry of readdirSync(clone)) if (entry !== ".git") rmSync(path.join(clone, entry), { recursive: true, force: true });
    exportServer(name, clone);
    sh("git", ["add", "-A"], clone);
    const changed = sh("git", ["status", "--porcelain"], clone);
    if (changed) {
      sh("git", ["commit", "-q", "-m", `Sync from ${CONFIG.githubOwner}/${CONFIG.collectionRepo}@${factorySha.slice(0, 12)}`], clone);
      sh("git", ["branch", "-M", "main"], clone);
      sh("git", ["push", "-q", "origin", "main"], clone);
    }
    sh("git", ["fetch", "-q", "origin", "main"], clone);
    const remoteTree = sh("git", ["rev-parse", "origin/main^{tree}"], clone);
    if (remoteTree !== tree) throw new Error(`parity failed for ${repo}: remote tree ${remoteTree} != factory tree ${tree}`);
    const signature = sh("git", ["log", "-1", "--format=%an <%ae> %G?", "origin/main"], clone);
    sh("gh", ["repo", "edit", repo, "--description", reg.description, "--homepage", `https://www.npmjs.com/package/${pkg.name}`, "--add-topic", repoTopics(pkg).join(",")]);
    if (makePublic) sh("gh", ["repo", "edit", repo, "--visibility", "public", "--accept-visibility-change-consequences"]);
    return { repo, tree, action: changed ? "pushed" : "already in sync", signature };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  const args = process.argv.slice(2);
  const names = args.filter((a) => !a.startsWith("--"));
  const targets = names.length ? names : listServerDirs().map((d) => path.basename(d));
  for (const name of targets) {
    const r = publishServer(name, { makePublic: args.includes("--public"), dry: args.includes("--dry") });
    process.stdout.write(`${r.repo}: ${r.action}, tree ${r.tree}${r.signature ? `, head ${r.signature}` : ""}\n`);
  }
}
