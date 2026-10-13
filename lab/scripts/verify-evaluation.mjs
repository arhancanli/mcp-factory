// Verifies the ten frozen task answers through real MCP; this is not an agent benchmark.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const ROOT = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const workspace = process.argv[2];
if (!workspace) throw new Error("Pass the isolated workspace created by prepare-evaluation.py.");
const client = new Client({ name: "lab-answer-verification", version: "1" });
await client.connect(new StdioClientTransport({ command: process.execPath,
  args: [path.join(ROOT, "lab/mcp-server.mjs")], cwd: ROOT,
  env: { ...process.env, CANLILABS_WORKSPACE: path.resolve(workspace) }, stderr: "ignore" }));
let calls = 0;
const call = async (name, args) => {
  calls++;
  const response = await client.callTool({ name, arguments: args });
  assert.ok(!response.isError, `${name} must succeed`);
  return response.structuredContent;
};
try {
  const groups = {};
  for (const recipe of ["ml", "dl", "rl"]) {
    const listing = await call("lab_list_experiments", { recipe, limit: 100 });
    assert.equal(listing.total_count, 3, "the evaluation workspace contains the frozen cohort only");
    groups[recipe] = [];
    for (const item of listing.items) groups[recipe].push(await call("lab_get_experiment", { run_id: item.run_id }));
  }
  const selected = (recipe, seed) => groups[recipe].find((r) => r.config.seed === seed);
  const dataset = await call("lab_inspect_dataset", { dataset_id: selected("ml", 7).result.data.dataset_id });
  assert.equal(dataset.content_hash_verified, true);
  const dlDataset = await call("lab_inspect_dataset", { dataset_id: selected("dl", 7).result.data.dataset_id });
  assert.equal(dlDataset.dataset_id, dataset.dataset_id);
  const ml19 = selected("ml", 19), dl19 = selected("dl", 19);
  assert.deepEqual(ml19.result.data, dl19.result.data);
  const answers = [
    dl19.result.metrics.test_accuracy > ml19.result.metrics.test_accuracy ? "dl" : "ml",
    String([...groups.dl].sort((a, b) => b.result.metrics.test_accuracy - a.result.metrics.test_accuracy)[0].config.seed),
    String(groups.rl.reduce((total, r) => total + r.result.metrics.evaluation.successes, 0)),
    String(Math.round((selected("dl", 43).result.metrics.test_accuracy - selected("ml", 43).result.metrics.test_accuracy) * selected("ml", 43).result.metrics.test_examples)),
    String(Math.round(selected("ml", 7).result.data.split_counts.train / dataset.rows * 100)),
    String([...groups.rl].sort((a, b) => b.result.metrics.random_policy_baseline.mean_episode_steps - a.result.metrics.random_policy_baseline.mean_episode_steps)[0].config.seed),
    String(new Set(groups.ml.map((r) => r.result.artifacts["model.npz"])).size),
    dataset.license,
    String(groups.rl.reduce((total, r) => total + r.result.metrics.evaluation.successes - r.result.metrics.random_policy_baseline.successes, 0)),
    String(new Set([...groups.ml, ...groups.dl].map((r) => `${r.result.data.dataset_id}/${r.result.data.split_sha256}`)).size),
  ];
  const xml = readFileSync(path.join(ROOT, "lab/evaluation/questions.xml"), "utf8");
  const expected = [...xml.matchAll(/<answer>([^<]+)<\/answer>/g)].map((m) => m[1]);
  assert.equal(expected.length, 10);
  assert.deepEqual(answers, expected);
  const receipt = { schema: "canlilabs.mcp-answer-verification.v1", verified_at: new Date().toISOString(),
    questions_sha256: createHash("sha256").update(xml).digest("hex"), transport: "stdio",
    agent_benchmark_executed: false, task_answers_verified: answers.length, mcp_calls: calls,
    answers, scope: "frozen cohort task answers and protocol execution; no incumbent or agent token comparison" };
  const timestamp = receipt.verified_at.replace(/[:.]/g, "-");
  const filename = process.argv[3] ? path.resolve(process.argv[3])
    : path.join(path.resolve(workspace), `answer-verification-${timestamp}.json`);
  writeFileSync(filename, `${JSON.stringify(receipt, null, 2)}\n`, { flag: "wx" });
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
} finally {
  await client.close();
}
