// Weekly canary (.github/workflows/canary.yml): git tag listings, action.yml and the runner list,
// live. Asserts only facts that should not change (an old tag's commit and runtime).
import assert from "node:assert/strict";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildServer } from "../src/server.mjs";

const client = new Client({ name: "canary", version: "0" });
const [a, b] = InMemoryTransport.createLinkedPair();
await Promise.all([buildServer().connect(a), client.connect(b)]);
await client.listTools();

test("live: actions/setup-node v4.0.0 still points at its commit and runs on Node 20", { timeout: 90_000 }, async () => {
  const r = await client.callTool({ name: "action_versions", arguments: { actions: ["actions/setup-node@v4.0.0"] } });
  const ref = r.structuredContent.results[0].ref;
  assert.deepEqual([ref.sha, ref.runtime], ["8f152de45cc393bb48ce5d89d36b731f54556e65", "node20"]);
  const w = await client.callTool({ name: "check_workflows", arguments: { files: [{ path: "a.yml", content: "on: push\njobs:\n  a:\n    runs-on: ubuntu-20.04\n    steps:\n      - run: echo hi\n" }] } });
  assert.ok(w.structuredContent.findings.some((f) => /ubuntu-20\.04.*no longer provides/.test(f.issue)));
  await client.close();
});
