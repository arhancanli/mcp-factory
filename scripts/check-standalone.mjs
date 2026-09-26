#!/usr/bin/env node
// node scripts/check-standalone.mjs [name...]
//
// Proves each server works as its own repository: exports the committed tree to a temporary
// directory with no factory around it, installs from the server's own shrinkwrap, runs its tests,
// and starts the packed tarball. CI runs this on every push; it needs the npm registry.
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { listServerDirs } from "./lib.mjs";
import { exportServer } from "./export.mjs";

const names = process.argv.slice(2).length ? process.argv.slice(2) : listServerDirs().map((d) => path.basename(d));
const INIT = '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"standalone","version":"1"}}}\n';
let failed = 0;
for (const name of names) {
  const dir = mkdtempSync(path.join(os.tmpdir(), `standalone-${name}-`));
  const { NODE_TEST_CONTEXT, ...env } = process.env;
  try {
    exportServer(name, dir);
    const run = (cmd, args, cwd = dir, input) => execFileSync(cmd, args, { cwd, env, input, encoding: "utf8", stdio: [input ? "pipe" : "ignore", "pipe", "pipe"] });
    run("npm", ["ci", "--ignore-scripts", "--no-audit", "--no-fund"]);
    // The server's own npm test (test/*.test.mjs), never "node --test test/": that form also runs
    // every other .mjs in test/, including the fixture recorder and the live canary.
    const out = run("npm", ["test"]);
    const passed = Number(out.match(/^(?:# |\u2139 )pass (\d+)/m)?.[1] ?? 0);
    if (!passed || !/^(?:# |\u2139 )fail 0$/m.test(out)) throw new Error(`tests did not pass cleanly (${passed} passed)`);
    const tgz = run("npm", ["pack", "--silent"]).trim().split("\n").pop();
    const smoke = path.join(dir, ".smoke");
    execFileSync("mkdir", ["-p", smoke]);
    execFileSync("tar", ["xzf", path.join(dir, tgz), "-C", smoke]);
    run("npm", ["ci", "--omit=dev", "--ignore-scripts", "--no-audit", "--no-fund"], path.join(smoke, "package"));
    let reply = "";
    try {
      reply = execFileSync(process.execPath, ["src/server.mjs"], { cwd: path.join(smoke, "package"), input: INIT, encoding: "utf8", timeout: 5000 });
    } catch (err) {
      reply = err.stdout ?? "";
    }
    if (!reply.includes('"serverInfo"')) throw new Error("packed server did not answer initialize");
    process.stdout.write(`ok ${name}: ${passed} tests pass standalone; packed tarball answers initialize\n`);
  } catch (err) {
    failed++;
    process.stdout.write(`FAIL ${name}: ${err.message}\n${err.stderr ?? ""}\n`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
process.exit(failed ? 1 : 0);
