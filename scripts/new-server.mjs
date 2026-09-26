#!/usr/bin/env node
// npm run new -- <name> --title "..." --description "..." --host api.example.org --instructions "..."
//
// Creates servers/<name> from the template, vendors the kit, writes the README tool table and an
// npm-shrinkwrap.json that pins every transitive dependency for npx and Docker users.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync, copyFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { generateServer, inspectServer, renderToolTable, replaceBlock } from "./lib.mjs";

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

export async function writeReadmeTools(serverDir) {
  const { tools } = await inspectServer(serverDir);
  const file = path.join(serverDir, "README.md");
  writeFileSync(file, replaceBlock(readFileSync(file, "utf8"), "tools", renderToolTable(tools)));
}

if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      title: { type: "string" },
      description: { type: "string" },
      host: { type: "string" },
      instructions: { type: "string" },
      budget: { type: "string" },
    },
  });
  const dir = generateServer({ name: positionals[0], ...values, budget: values.budget ? Number(values.budget) : undefined });
  writeShrinkwrap(dir);
  await writeReadmeTools(dir);
  process.stdout.write(`Created ${path.relative(process.cwd(), dir)}. Next: replace src/tools/example-lookup.mjs, record fixtures, run npm test.\n`);
}
