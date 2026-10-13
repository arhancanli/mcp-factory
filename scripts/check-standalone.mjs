#!/usr/bin/env node
// Proves committed standalone packages install, pass tests and answer real MCP requests.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { listServerDirs } from "./lib.mjs";
import { exportServer } from "./export.mjs";
import { parseSelectedNames } from "./ci-plan.mjs";

export async function checkStandalone(name, { ref = "HEAD" } = {}) {
  const dir = mkdtempSync(path.join(os.tmpdir(), `standalone-${name}-`));
  const { NODE_TEST_CONTEXT, ...env } = process.env;
  const run = (cmd, args, cwd = dir) => execFileSync(cmd, args, {
    cwd, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 180_000,
  });
  try {
    const { tree } = exportServer(name, dir, { ref });
    run("npm", ["ci", "--ignore-scripts", "--no-audit", "--no-fund"]);
    const log = run("npm", ["test"]);
    const passed = Number(log.match(/^(?:# |\u2139 )pass (\d+)/m)?.[1] ?? 0);
    if (!passed || !/^(?:# |\u2139 )fail 0$/m.test(log)) throw new Error(`tests did not pass cleanly (${passed} passed)`);
    const tgz = run("npm", ["pack", "--silent", "--ignore-scripts"]).trim().split("\n").pop();
    const packedIntegrity = `sha512-${createHash("sha512").update(readFileSync(path.join(dir, tgz))).digest("base64")}`;
    const smoke = path.join(dir, ".smoke");
    mkdirSync(smoke);
    run("tar", ["xzf", path.join(dir, tgz), "-C", smoke]);
    const packed = path.join(smoke, "package");
    run("npm", ["ci", "--omit=dev", "--ignore-scripts", "--no-audit", "--no-fund"], packed);
    const pkg = JSON.parse(readFileSync(path.join(packed, "package.json"), "utf8"));
    const client = new Client({ name: "standalone-check", version: "1" });
    const transport = new StdioClientTransport({ command: process.execPath, args: ["src/server.mjs"], cwd: packed, env, stderr: "ignore" });
    const timer = setTimeout(() => { void client.close(); }, 10_000);
    try {
      await client.connect(transport);
      if (client.getServerVersion()?.version !== pkg.version) throw new Error("Packed initialize version differs.");
      const first = await client.listTools();
      const second = await client.listTools();
      if (!first.tools?.length || JSON.stringify(first) !== JSON.stringify(second) || JSON.stringify(first.tools).length > (pkg.factory?.toolListBudget ?? 6000)) throw new Error("Packed tool list is missing, unstable or over budget.");
    } finally { clearTimeout(timer); await client.close(); }
    return { name, tree, tests: passed, log, initialize: true, tools_list: true, packed_integrity: packedIntegrity };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  const args = process.argv.slice(2);
  const available = listServerDirs().map((d) => path.basename(d));
  if (args[0] === "--names-json" && args.length !== 2) throw new Error("--names-json requires exactly one selection.");
  const names = args.length ? parseSelectedNames(args[0] === "--names-json" ? args[1] : JSON.stringify(args), available) : available;
  let failed = 0;
  for (const name of names) {
    const start = performance.now();
    try {
      const record = await checkStandalone(name);
      process.stdout.write(`ok ${name}: ${record.tests} tests pass standalone; packed tarball initializes and lists tools\n`);
      const { log, ...receipt } = record;
      process.stdout.write(`standalone_receipt ${JSON.stringify({ ...receipt, duration_ms: Math.round(performance.now() - start) })}\n`);
    } catch (error) {
      failed++;
      process.stdout.write(`FAIL ${name}: ${error.message}\n${String(error.stdout ?? "").slice(-16_000)}\n${String(error.stderr ?? "").slice(-4000)}\n`);
    }
  }
  process.exitCode = failed ? 1 : 0;
}
