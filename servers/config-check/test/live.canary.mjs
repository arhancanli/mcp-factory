// Weekly canary (.github/workflows/canary.yml): SchemaStore's catalog and schemas, live. Asserts
// only facts that should not change (runs-on is a job key, a tsconfig target is from a fixed list).
import assert from "node:assert/strict";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildServer } from "../src/server.mjs";

const client = new Client({ name: "canary", version: "0" });
const [a, b] = InMemoryTransport.createLinkedPair();
await Promise.all([buildServer().connect(a), client.connect(b)]);
await client.listTools();

test("live: a workflow's misspelt runs-on and a tsconfig's unknown target are caught", { timeout: 90_000 }, async () => {
  const r = await client.callTool({
    name: "validate_config",
    arguments: {
      files: [
        { path: ".github/workflows/ci.yml", content: "on: push\njobs:\n  a:\n    runs_on: ubuntu-latest\n    steps:\n      - run: echo hi\n" },
        { path: "tsconfig.json", content: '{ "compilerOptions": { "target": "es1999" } }' },
      ],
    },
  });
  const [wf, ts] = r.structuredContent.files;
  assert.ok(wf.errors.some((e) => e.did_you_mean === "runs-on"), JSON.stringify(wf));
  assert.ok(ts.errors.some((e) => e.path === "compilerOptions.target" && e.allowed?.includes("esnext")), JSON.stringify(ts));
  const f = await client.callTool({ name: "find_schema", arguments: { query: "docker-compose.yml" } });
  assert.match(f.structuredContent.schemas[0].url, /compose/);
  await client.close();
});
