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
