#!/usr/bin/env node
// node scripts/launch-kit.mjs [name...]
//
// Renders each server's launch copy (marketing/<name>.md, written by hand with {{placeholders}})
// into marketing/dist/<name>.md, filling every number from the server's measured files
// (bench/perf.json, the live tool list, catalog.json), so no figure in a post is typed and none goes
// stale. Also renders marketing/dist/profile-README.md, the owner's GitHub profile page listing the
// whole collection. An unknown placeholder is an error, never left in the output.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { CONFIG, inspectServer, listServerDirs, readJson, ROOT } from "./lib.mjs";
import { buildCatalog } from "./render.mjs";
import { readPerf } from "./perf.mjs";

const MARKETING = path.join(ROOT, "marketing");
const fmt = (n) => Number(n).toLocaleString("en-US");
const secs = (ms) => (ms / 1000).toFixed(1);

export async function facts(dir, catalog) {
  const pkg = readJson(path.join(dir, "package.json"));
  const perf = readPerf(dir);
  const { tools } = await inspectServer(dir);
  const self = catalog.servers.find((s) => s.name === pkg.name);
  const firsts = perf ? perf.scenarios.map((s) => s.first_call_ms) : [];
  const related = catalog.servers.filter((s) => s.name !== pkg.name).slice(0, 3);
  const f = {
    title: pkg.factory.displayName,
    package: pkg.name,
    repo: self?.repository ?? `https://github.com/${CONFIG.githubOwner}/${pkg.name}`,
    npm: `https://www.npmjs.com/package/${pkg.name}`,
    install: `npx -y ${pkg.name}`,
    claude_code_install: `claude mcp add ${pkg.name.replace(/-mcp$/, "")} -- npx -y ${pkg.name}`,
    summary: self?.summary ?? "",
    description: pkg.description,
    tool_count: String(tools.length),
    tool_names: tools.map((t) => `\`${t.name}\``).join(", "),
    collection: `https://github.com/${CONFIG.githubOwner}/${CONFIG.collectionRepo}`,
    collection_topic: `https://github.com/topics/${CONFIG.collectionTopic}`,
    collection_size: String(catalog.servers.length),
    related: related.length ? related.map((s) => `${s.title} (${s.repository})`).join(", ") : "more on the way",
  };
  if (perf) {
    Object.assign(f, {
      measured_on: perf.measured_on,
      measured_where: perf.where,
      tool_chars: fmt(perf.tool_definition_chars),
      first_call_range: `${secs(Math.min(...firsts))} to ${secs(Math.max(...firsts))} s`,
      repeat_max_ms: String(Math.max(...perf.scenarios.map((s) => s.repeat_ms))),
    });
    if (perf.competitor) {
      const saving = Math.round((1 - perf.tool_definition_chars / perf.competitor.tool_definition_chars) * 100);
      Object.assign(f, { competitor: perf.competitor.label, competitor_tool_chars: fmt(perf.competitor.tool_definition_chars), tool_saving_pct: `${saving}%` });
    }
  }
  return f;
}

export function fill(template, f, label) {
  return template.replace(/\{\{(\w+)\}\}/g, (m, key) => {
    if (!(key in f)) throw new Error(`${label}: placeholder ${m} has no measured value`);
    return f[key];
  });
}

export function renderProfile(catalog) {
  const lines = [
    `# Arhan Canli`,
    "",
    `I build MCP servers that are measured against the best alternative before they ship: correct answers, small tool lists, fast first calls. ${catalog.servers.length} so far, each in its own repository, all MIT.`,
    "",
  ];
  for (const [key, label] of Object.entries(CONFIG.categories)) {
    const inCat = catalog.servers.filter((s) => s.category === key);
    if (!inCat.length) continue;
    lines.push(`**${label}**`, "");
    for (const s of inCat) lines.push(`- [${s.title}](${s.repository}): ${s.summary}`);
    lines.push("");
  }
  lines.push(`All of them: [github.com/topics/${CONFIG.collectionTopic}](https://github.com/topics/${CONFIG.collectionTopic})`);
  return `${lines.join("\n")}\n`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  const catalog = await buildCatalog();
  const wanted = process.argv.slice(2);
  mkdirSync(path.join(MARKETING, "dist"), { recursive: true });
  for (const dir of listServerDirs()) {
    const name = path.basename(dir);
    if (wanted.length && !wanted.includes(name)) continue;
    const src = path.join(MARKETING, `${name}.md`);
    if (!existsSync(src)) {
      process.stdout.write(`skip ${name}: no marketing/${name}.md yet\n`);
      continue;
    }
    const out = fill(readFileSync(src, "utf8"), await facts(dir, catalog), name);
    writeFileSync(path.join(MARKETING, "dist", `${name}.md`), out);
    process.stdout.write(`wrote marketing/dist/${name}.md\n`);
  }
  writeFileSync(path.join(MARKETING, "dist", "profile-README.md"), renderProfile(catalog));
  process.stdout.write("wrote marketing/dist/profile-README.md\n");
}
