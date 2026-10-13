import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const LAB = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PYTHON = process.env.CANLILABS_PYTHON ?? path.join(LAB, ".venv", "bin/python");
const digest = (filename) => createHash("sha256").update(readFileSync(filename)).digest("hex");

test("real stdio MCP reads trained metrics and verified dataset metadata without changing the ledger", async (t) => {
  const workspace = mkdtempSync(path.join(os.tmpdir(), "canlilabs-mcp-"));
  t.after(() => rmSync(workspace, { recursive: true, force: true }));
  const run = JSON.parse(execFileSync(PYTHON, ["-m", "canlilabs.cli", "--workspace", workspace, "train", "ml"], { encoding: "utf8", cwd: LAB, timeout: 60_000 }));
  const database = path.join(workspace, "experiments.sqlite");
  const before = digest(database);
  const client = new Client({ name: "lab-test", version: "1" });
  t.after(() => client.close());
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [path.join(LAB, "mcp-server.mjs")], cwd: LAB, env: { ...process.env, CANLILABS_WORKSPACE: workspace, CANLILABS_PYTHON: PYTHON }, stderr: "ignore" }));
  const first = await client.listTools();
  assert.equal(first.tools.length, 3);
  assert.ok(JSON.stringify(first.tools).length < 6000);
  assert.deepEqual(await client.listTools(), first);
  for (const tool of first.tools) {
    assert.equal(tool.annotations.readOnlyHint, true);
    assert.equal(tool.annotations.openWorldHint, false);
    assert.equal(tool.outputSchema.type, "object");
  }
  const listing = await client.callTool({ name: "lab_list_experiments", arguments: { recipe: "ml", limit: 1 } });
  assert.equal(listing.structuredContent.total_count, 1);
  assert.equal(listing.structuredContent.items[0].run_id, run.run_id);
  const inspected = await client.callTool({ name: "lab_get_experiment", arguments: { run_id: run.run_id } });
  assert.equal(inspected.structuredContent.state, "succeeded");
  assert.ok(inspected.structuredContent.result.metrics.test_accuracy > inspected.structuredContent.result.metrics.baseline_test_accuracy);
  const dataset = await client.callTool({ name: "lab_inspect_dataset", arguments: { dataset_id: run.result.data.dataset_id } });
  assert.equal(dataset.structuredContent.content_hash_verified, true);
  assert.equal(dataset.structuredContent.rows, 1200);
  assert.equal(dataset.structuredContent.license, "CC0-1.0");
  assert.equal(digest(database), before, "read-only MCP calls do not alter experiment records");
  const invalid = await client.callTool({ name: "lab_get_experiment", arguments: { run_id: "0".repeat(32) } });
  assert.equal(invalid.isError, true);
  assert.equal(JSON.parse(invalid.content[0].text).error.code, "not_found");
});
