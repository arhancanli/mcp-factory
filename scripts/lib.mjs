// scripts/lib.mjs: shared helpers for the factory scripts and the gate.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

export const ROOT = path.resolve(fileURLToPath(import.meta.url), "../..");
export const KIT_DIR = path.join(ROOT, "kit");
export const TEMPLATE_DIR = path.join(ROOT, "templates/server");
export const SERVERS_DIR = path.join(ROOT, "servers");
export const CONFIG = JSON.parse(readFileSync(path.join(ROOT, "factory.config.json"), "utf8"));

export const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));

export function listServerDirs() {
  if (!existsSync(SERVERS_DIR)) return [];
  return readdirSync(SERVERS_DIR)
    .filter((d) => !d.startsWith(".") && existsSync(path.join(SERVERS_DIR, d, "package.json")))
    .sort()
    .map((d) => path.join(SERVERS_DIR, d));
}

/** The kit files a server vendors: every kit/*.mjs, never the kit's tests. */
export function kitFiles() {
  return readdirSync(KIT_DIR).filter((f) => f.endsWith(".mjs")).sort();
}

export const REPO_TEMPLATE_DIR = path.join(ROOT, "templates/repo");

/** Every file of the standalone-repo scaffolding, as paths relative to templates/repo. */
export const repoTemplateFiles = () => gitFiles(REPO_TEMPLATE_DIR);

/** Copies the standalone-repo scaffolding (workflows, SECURITY.md, .gitignore) into a server. */
export function syncRepoFiles(serverDir) {
  for (const rel of repoTemplateFiles()) {
    const to = path.join(serverDir, rel);
    mkdirSync(path.dirname(to), { recursive: true });
    copyFileSync(path.join(REPO_TEMPLATE_DIR, rel), to);
  }
}

export function syncKit(serverDir) {
  const dest = path.join(serverDir, "src/kit");
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  for (const f of kitFiles()) copyFileSync(path.join(KIT_DIR, f), path.join(dest, f));
}

/**
 * Files under dir that git tracks or would track (untracked but not ignored), relative to dir.
 * Templates are copied from this list, never from a raw directory listing, so files a local tool
 * drops into the tree (ignored through .git/info/exclude) can never spread into servers.
 */
export function gitFiles(dir) {
  const rel = path.relative(ROOT, dir);
  return execFileSync("git", ["ls-files", "-co", "--exclude-standard", "-z", "--", rel], { cwd: ROOT, encoding: "utf8" })
    .split("\0")
    .filter(Boolean)
    .map((f) => path.relative(rel, f))
    .filter((f) => existsSync(path.join(dir, f)))
    .sort();
}

function copyTree(src, dest, transform) {
  for (const rel of gitFiles(src)) {
    const to = path.join(dest, rel);
    mkdirSync(path.dirname(to), { recursive: true });
    writeFileSync(to, transform(readFileSync(path.join(src, rel), "utf8")));
  }
}

const NAME_RE = /^[a-z][a-z0-9-]{1,40}$/;

/**
 * Creates a server from the template. Refuses to overwrite an existing directory.
 * @returns {string} the new server's directory
 */
export function generateServer({ name, title, description, summary, host, instructions, category, budget = CONFIG.defaultToolListBudget, outDir = path.join(SERVERS_DIR, name) }) {
  if (!NAME_RE.test(name ?? "")) throw new Error("name must be lowercase letters, digits and dashes, 2-41 chars");
  for (const [k, v] of Object.entries({ title, description, summary, host, instructions, category })) {
    if (!v) throw new Error(`--${k} is required`);
    if (/["\\\n]/.test(v)) throw new Error(`--${k} must not contain quotes, backslashes or newlines`);
  }
  if (!(category in CONFIG.categories)) throw new Error(`--category must be one of ${Object.keys(CONFIG.categories).join(", ")}`);
  if (summary.length > 100) throw new Error(`--summary is ${summary.length} chars; the MCP Registry allows 100`);
  if (existsSync(outDir)) throw new Error(`${outDir} already exists`);
  const pkgName = CONFIG.packageName.replace("{name}", name);
  const values = {
    name,
    title,
    description,
    summary,
    host,
    instructions,
    category,
    budget: String(budget),
    package: pkgName,
    mcpName: `${CONFIG.mcpNamePrefix}${pkgName}`,
    owner: CONFIG.githubOwner,
  };
  copyTree(TEMPLATE_DIR, outDir, (text) =>
    text.replace(/\{\{(\w+)\}\}/g, (m, key) => {
      if (!(key in values)) throw new Error(`template placeholder ${m} has no value`);
      return values[key];
    }),
  );
  syncKit(outDir);
  syncRepoFiles(outDir);
  return outDir;
}

/** Spawns the server over real stdio and returns what a client sees at connect. */
export async function inspectServer(dir) {
  const serverDir = path.resolve(dir);
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(serverDir, "src/server.mjs")],
    cwd: serverDir,
    stderr: "pipe",
  });
  const client = new Client({ name: "factory-gate", version: "1" });
  await client.connect(transport);
  try {
    const { tools } = await client.listTools();
    return { serverInfo: client.getServerVersion(), instructions: client.getInstructions(), tools };
  } finally {
    await client.close();
  }
}

/** The characters a model sees for the tool list on every turn. */
export const toolListChars = (tools) => JSON.stringify(tools).length;

export function renderToolTable(tools) {
  const esc = (s) => String(s).replace(/\|/g, "\\|");
  const rows = [...tools]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((t) => `| \`${t.name}\` | ${esc(t.description)} |`);
  return ["| Tool | What it does |", "| --- | --- |", ...rows].join("\n");
}

export function replaceBlock(text, marker, body) {
  const re = new RegExp(`(<!-- ${marker}:start -->)[\\s\\S]*?(<!-- ${marker}:end -->)`);
  if (!re.test(text)) throw new Error(`README has no ${marker} block`);
  return text.replace(re, `$1\n${body}\n$2`);
}
