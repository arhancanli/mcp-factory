#!/usr/bin/env node
// npm run sync: copies the canonical kit into every server and regenerates each README tool table.
// Run it after changing kit/ or any tool's description; the gate fails until you do.
import { listServerDirs, syncKit } from "./lib.mjs";
import { writeReadmeTools } from "./new-server.mjs";

for (const dir of listServerDirs()) {
  syncKit(dir);
  await writeReadmeTools(dir);
  process.stdout.write(`synced ${dir}\n`);
}

// Root README: one row per server, from its package.json.
{
  const { readFileSync, writeFileSync } = await import("node:fs");
  const path = await import("node:path");
  const { ROOT, readJson, replaceBlock } = await import("./lib.mjs");
  const rows = listServerDirs().map((dir) => {
    const pkg = readJson(path.join(dir, "package.json"));
    const rel = path.relative(ROOT, dir);
    return `| [${pkg.factory.displayName}](${rel}) | ${pkg.description} | \`npx -y ${pkg.name}\` |`;
  });
  const body = rows.length ? ["| Server | What it does | Run |", "| --- | --- | --- |", ...rows].join("\n") : "None published yet.";
  const readme = path.join(ROOT, "README.md");
  writeFileSync(readme, replaceBlock(readFileSync(readme, "utf8"), "servers", body));
}
