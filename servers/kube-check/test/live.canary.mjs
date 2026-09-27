// Weekly canary (.github/workflows/canary.yml): the release list, the newest version's API
// definitions and Pluto's table, live. Asserts only facts that should not change (Ingress left
// extensions/v1beta1 in 1.22; CronJob is batch/v1).
import assert from "node:assert/strict";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildServer } from "../src/server.mjs";

const client = new Client({ name: "canary", version: "0" });
const [a, b] = InMemoryTransport.createLinkedPair();
await Promise.all([buildServer().connect(a), client.connect(b)]);
await client.listTools();

test("live: a removed Ingress and a misspelt field are caught on the newest version", { timeout: 120_000 }, async () => {
  const r = await client.callTool({
    name: "check_manifests",
    arguments: { files: [{ path: "a.yaml", content: "apiVersion: extensions/v1beta1\nkind: Ingress\nmetadata:\n  name: a\n---\napiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: b\ndata2:\n  k: v\n" }] },
  });
  const d = r.structuredContent;
  assert.ok(Number(d.kubernetes_version.split(".")[1]) >= 37, d.kubernetes_version);
  assert.ok(d.findings.some((f) => f.rule === "removed-api" && /removed in Kubernetes 1\.22/.test(f.message)), JSON.stringify(d.findings));
  assert.ok(d.findings.some((f) => f.path === "data2" && f.did_you_mean === "data"), JSON.stringify(d.findings));
  const v = await client.callTool({ name: "api_versions", arguments: { kinds: ["CronJob"] } });
  assert.equal(v.structuredContent.results[0].use, "batch/v1");
  await client.close();
});
