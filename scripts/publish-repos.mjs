#!/usr/bin/env node
// node scripts/publish-repos.mjs [name...] [--private] [--dry]
//
// Prepares owner-signed source updates as draft PRs in each standalone repository.
// creates the repository if it does not exist (public, as the owner decided on 2026-09-26; --private
// for an unreleased experiment), with a release environment for CI publishing, replaces its
// content with the committed tree of servers/<name>, commits as the owner with the owner's SSH
// signature, pushes a review branch, then proves parity: its tree id must equal the factory's tree
// id for servers/<name>. Equal tree ids mean every file is byte-identical and nothing extra exists.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { CONFIG, listServerDirs, readJson, ROOT } from "./lib.mjs";
import { assertCommitted, exportServer, serverTree } from "./export.mjs";

const OWNER_EMAIL = "315329124+arhancanli@users.noreply.github.com";
const SIGNING_KEY = path.join(os.homedir(), ".ssh/git_signing_ed25519.pub");

// GitHub drops connections now and then; gh and git calls that fail on the network are tried again.
const NETWORK = /connection refused|connection reset|timeout|timed out|EOF|TLS handshake|50[234]|dial tcp|Failed to connect|Couldn't connect|Could not resolve host|early EOF|RPC failed/i;
const sh = (cmd, args, cwd) => {
  for (let attempt = 0; ; attempt++) {
    try {
      return execFileSync(cmd, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
    } catch (err) {
      if (!["gh", "git"].includes(cmd) || attempt >= 3 || !NETWORK.test(String(err.stderr ?? ""))) throw err;
      execFileSync("sleep", [String(3 * (attempt + 1))]);
    }
  }
};
// Only GitHub's own "not found" answer means absent; any other failure (a dropped connection, a
// rate limit) is retried and then raised, never read as "create it".
const exists = (repo) => {
  for (let attempt = 0; ; attempt++) {
    try {
      sh("gh", ["repo", "view", repo, "--json", "name"]);
      return true;
    } catch (err) {
      if (/Could not resolve to a Repository/i.test(String(err.stderr ?? ""))) return false;
      if (attempt >= 2) throw err;
      execFileSync("sleep", [String(2 * (attempt + 1))]);
    }
  }
};

/** GitHub topics: the shared collection topic (one topic page lists every server), the MCP topics,
 * the category and the package keywords; GitHub allows 20, lowercase letters, digits and dashes. */
export function repoTopics(pkg) {
  const all = [CONFIG.collectionTopic, "mcp", "mcp-server", "model-context-protocol", pkg.factory.category, ...(pkg.keywords ?? [])];
  return [...new Set(all.map((t) => String(t).toLowerCase().replace(/[^a-z0-9-]/g, "-")).filter((t) => /^[a-z0-9][a-z0-9-]{0,49}$/.test(t)))].slice(0, 20);
}

export function publishServer(name, { makePublic = true, dry = false } = {}) {
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
    sh("gh", ["api", "-X", "PUT", `repos/${repo}/environments/release`, "--silent"]);
  }
  const work = mkdtempSync(path.join(os.tmpdir(), `publish-${name}-`));
  try {
    const clone = path.join(work, "repo");
    sh("gh", ["repo", "clone", repo, clone, "--", "--quiet"]);
    for (const [k, v] of [["user.name", CONFIG.author.name], ["user.email", OWNER_EMAIL], ["gpg.format", "ssh"], ["user.signingkey", SIGNING_KEY], ["commit.gpgsign", "true"]]) {
      sh("git", ["config", k, v], clone);
    }
    // An empty new repository needs a harmless signed base before a PR can be opened.
    let hasMain = true;
    try { sh("git", ["rev-parse", "--verify", "origin/main"], clone); } catch { hasMain = false; }
    if (!hasMain) {
      let hasHistory = true;
      try { sh("git", ["rev-parse", "--verify", "HEAD"], clone); } catch { hasHistory = false; }
      if (hasHistory) throw new Error(`${repo} has history but no main branch; inspect its owner review base before changing it.`);
      writeFileSync(path.join(clone, "README.md"), `# ${pkg.factory.displayName}\n\nSource is being prepared for owner review.\n`);
      sh("git", ["add", "README.md"], clone);
      sh("git", ["commit", "-q", "-m", "Initialize the standalone review base"], clone);
      sh("git", ["branch", "-M", "main"], clone);
      sh("git", ["push", "-q", "origin", "main"], clone);
    }
    const branch = `canlilabs-sync-${tree}`;
    const remoteBranch = sh("git", ["ls-remote", "--heads", "origin", `refs/heads/${branch}`], clone);
    if (remoteBranch) {
      sh("git", ["fetch", "-q", "origin", branch], clone);
      if (sh("git", ["rev-parse", `origin/${branch}^{tree}`], clone) !== tree) throw new Error("The existing review branch differs; do not overwrite owner changes.");
      const existing = JSON.parse(sh("gh", ["pr", "list", "--repo", repo, "--head", branch, "--state", "open", "--json", "url"], clone));
      if (!existing.length) throw new Error("The matching branch has no open review; inspect its closed/merged state before reusing it.");
      return { repo, tree, action: "existing review", review: existing[0].url };
    }
    sh("git", ["checkout", "-q", "-b", branch, "main"], clone);
    for (const entry of readdirSync(clone)) if (entry !== ".git") rmSync(path.join(clone, entry), { recursive: true, force: true });
    exportServer(name, clone);
    sh("git", ["add", "-A"], clone);
    const changed = sh("git", ["status", "--porcelain"], clone);
    if (changed) {
      sh("git", ["commit", "-q", "-m", `Sync from ${CONFIG.githubOwner}/${CONFIG.collectionRepo}@${factorySha.slice(0, 12)}`], clone);
      // A non-fast-forward refusal protects any existing review branch from being overwritten.
      sh("git", ["push", "-q", "origin", branch], clone);
    }
    const target = changed ? branch : "main";
    sh("git", ["fetch", "-q", "origin", target], clone);
    const remoteTree = sh("git", ["rev-parse", `origin/${target}^{tree}`], clone);
    if (remoteTree !== tree) throw new Error(`parity failed for ${repo}: remote tree ${remoteTree} != factory tree ${tree}`);
    const signature = sh("git", ["log", "-1", "--format=%an <%ae> %G?", `origin/${target}`], clone);
    let review = null;
    if (changed) {
      const existing = JSON.parse(sh("gh", ["pr", "list", "--repo", repo, "--head", branch, "--state", "open", "--json", "url"], clone));
      if (existing.length) review = existing[0].url;
      else {
        const body = path.join(work, "review-body.md");
        writeFileSync(body, `Update this standalone server to the committed factory source at ${CONFIG.githubOwner}/${CONFIG.collectionRepo}@${factorySha}.\n\nThe review branch has exact tree parity: ${tree}. It is signed under the owner identity. Merge and publication follow the existing owner review and release-evidence gates.\n`);
        review = sh("gh", ["pr", "create", "--repo", repo, "--base", "main", "--head", branch, "--draft", "--title", `Sync ${pkg.factory.displayName} from the factory`, "--body-file", body], clone);
      }
    }
    sh("gh", ["repo", "edit", repo, "--description", reg.description, "--homepage", `https://www.npmjs.com/package/${pkg.name}`, "--add-topic", repoTopics(pkg).join(",")]);
    return { repo, tree, action: changed ? "prepared review" : "already in sync", signature, review };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  const args = process.argv.slice(2);
  const names = args.filter((a) => !a.startsWith("--"));
  const targets = names.length ? names : listServerDirs().map((d) => path.basename(d));
  for (const name of targets) {
    const r = publishServer(name, { makePublic: !args.includes("--private"), dry: args.includes("--dry") });
    process.stdout.write(`${r.repo}: ${r.action}, tree ${r.tree}${r.signature ? `, head ${r.signature}` : ""}${r.review ? `, ${r.review}` : ""}\n`);
  }
}
