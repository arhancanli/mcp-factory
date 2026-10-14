#!/usr/bin/env node
// Verify fixed answers via real MCP calls; this is not a paid agent/incumbent benchmark.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { connectMcp, MCP_CONNECTOR_SHA256 } from "../bench/mcp-client.mjs";
import { grade, hash, identityHash, sourceSnapshot } from "../kit/release.mjs";
import { ROOT } from "./lib.mjs";

export async function verifyCorpus(name) {
  if (!/^[a-z][a-z0-9-]{1,40}$/.test(name ?? "")) throw new Error("Choose a valid server name.");
  const directory = path.join(ROOT, "servers", name);
  const spec = JSON.parse(readFileSync(path.join(directory, "bench/tasks.json")));
  const source = sourceSnapshot(directory);
  const { VERIFICATIONS } = await import(pathToFileURL(path.join(directory, "test/corpus-verification.mjs")));
  if (new Set(spec.tasks.map((task) => task.id)).size !== spec.tasks.length || Object.keys(VERIFICATIONS).length !== spec.tasks.length) throw new Error("Every fixed task needs one independent verification.");
  const client = await connectMcp({ command: process.execPath, args: ["src/server.mjs"], cwd: directory });
  const rows = [];
  try {
    await client.listTools(undefined, { timeout: 15_000 });
    for (const task of spec.tasks) {
      const observations = [];
      const call = async (tool, args) => {
        const out = await client.callTool({ name: tool, arguments: args }, undefined, { timeout: 15_000 });
        if (out.isError) throw new Error(`${task.id}: ${tool} failed`);
        const result = out.structuredContent ?? JSON.parse(out.content[0].text);
        observations.push({ tool, arguments: args, result });
        return result;
      };
      const answer = await VERIFICATIONS[task.id](call);
      const correct = grade(task.expect, `ANSWER: ${answer}`);
      rows.push({ id: task.id, answer, correct, observations });
    }
  } finally { await client.close(); }
  if (sourceSnapshot(directory).sha256 !== source.sha256) throw new Error("Source changed during direct verification.");
  return { schema: "canlilabs.direct-task-verification.v1", verified_at: new Date().toISOString(), source_sha256: source.sha256,
    tasks_sha256: identityHash(spec), runner_sha256: hash(readFileSync(new URL(import.meta.url))), connector_sha256: MCP_CONNECTOR_SHA256,
    transport: "stdio", agent_benchmark_executed: false, total_tasks: rows.length, correct: rows.filter((row) => row.correct).length,
    mcp_calls: rows.reduce((total, row) => total + row.observations.length, 0), rows,
    scope: "Fixed answer projections and real protocol calls; no agent accuracy, token comparison or strongest-server qualification." };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [name, output] = process.argv.slice(2);
  const receipt = await verifyCorpus(name);
  if (output) writeFileSync(output, `${JSON.stringify(receipt, null, 2)}\n`, { flag: "wx" });
  process.stdout.write(`${JSON.stringify({ tasks: receipt.total_tasks, correct: receipt.correct, calls: receipt.mcp_calls })}\n`);
  process.exitCode = receipt.correct === receipt.total_tasks ? 0 : 1;
}
