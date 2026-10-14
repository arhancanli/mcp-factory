#!/usr/bin/env node
// Laboratory pilot: explicit local workspace, metadata only, no training or model execution.
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { z } from "zod";
import { createServer, defineTool, ToolError } from "../kit/tool.mjs";
import { isMain, runStdio } from "../kit/main.mjs";

const LAB = path.dirname(fileURLToPath(import.meta.url));
const exec = promisify(execFile);
const annotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

export function createContext({ workspace, python } = {}) {
  const local = path.join(LAB, ".venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
  return {
    workspace: path.resolve(workspace ?? process.env.CANLILABS_WORKSPACE ?? path.join(LAB, "../.lab")),
    python: python ?? process.env.CANLILABS_PYTHON ?? (existsSync(local) ? local : "python3"),
  };
}

async function read(ctx, command, args = []) {
  let stdout;
  try {
    ({ stdout } = await exec(ctx.python, ["-m", "canlilabs.reader", "--workspace", ctx.workspace, command, ...args], {
      cwd: LAB, timeout: 10_000, maxBuffer: 256 * 1024,
    }));
  } catch (error) {
    if (error.stdout) stdout = error.stdout;
    else throw new ToolError("lab_unavailable", "The laboratory reader did not finish. Run uv sync in lab/ and verify CANLILABS_PYTHON and CANLILABS_WORKSPACE.");
  }
  let result;
  try { result = JSON.parse(stdout); } catch { throw new ToolError("invalid_lab_response", "The reader did not return bounded JSON. Verify the laboratory installation."); }
  if (result.error) throw new ToolError(result.error.code, result.error.message);
  return result;
}

export const TOOLS = [
  defineTool({
    name: "lab_list_experiments", title: "List laboratory experiments",
    description: "Lists experiment IDs, recipes and states from the configured local laboratory, including failed trials. Filter by ml, dl, rl or dqn. Results are paginated; use lab_get_experiment for metrics and provenance.",
    input: { recipe: z.enum(["ml", "dl", "rl", "dqn"]).optional(), limit: z.int().min(1).max(100).default(20), offset: z.int().min(0).max(1_000_000).default(0) },
    output: { total_count: z.number(), items: z.array(z.looseObject({ run_id: z.string(), recipe: z.string(), state: z.string() })), has_more: z.boolean(), next_offset: z.number().nullable() },
    annotations,
    handler: ({ recipe, limit, offset }, ctx) => read(ctx, "list", ["--limit", String(limit), "--offset", String(offset), ...(recipe ? ["--recipe", recipe] : [])]),
  }),
  defineTool({
    name: "lab_get_experiment", title: "Inspect one experiment",
    description: "Reads a laboratory run's configuration, seed, state, held-out metrics, baseline, code/dependency provenance and artifact hashes. The ID comes from lab_list_experiments. Does not run training or load model weights.",
    input: { run_id: z.string().regex(/^[a-f0-9]{32}$/).max(32).describe("Run ID from lab_list_experiments") },
    output: { run_id: z.string(), state: z.string(), config: z.unknown(), provenance: z.unknown(), result: z.unknown() },
    annotations, handler: ({ run_id }, ctx) => read(ctx, "get", [run_id]),
  }),
  defineTool({
    name: "lab_inspect_dataset", title: "Inspect dataset provenance",
    description: "Reads source, declared licence, schema, counts and CSV hash. Optionally verifies a run's split hash and reports strategy, leakage checks and training-only profile statistics. IDs come from lab_get_experiment. Returns metadata without rows, row positions or model weights; declared rights are not independently inferred.",
    input: { dataset_id: z.string().regex(/^[a-f0-9]{64}$/).max(64).describe("Dataset content hash from an experiment"), split_sha256: z.string().regex(/^[a-f0-9]{64}$/).max(64).optional().describe("Optional split hash from the same experiment") },
    output: { dataset_id: z.string(), source: z.string(), license: z.string(), rows: z.number(), columns: z.array(z.string()), content_hash_verified: z.boolean(), split_hash_verified: z.boolean().optional(), manifest_hash_verified: z.boolean().optional(), split: z.unknown().optional(), profile: z.unknown().optional() },
    annotations, handler: ({ dataset_id, split_sha256 }, ctx) => read(ctx, "dataset", [dataset_id, ...(split_sha256 ? ["--split-sha256", split_sha256] : [])]),
  }),
];

export function buildServer(ctx = createContext()) {
  return createServer({ name: "canlilabs-lab-pilot", version: "0.1.0", tools: TOOLS, ctx,
    instructions: "Read-only local laboratory pilot. List runs before inspection; compare held-out metrics and baselines, inspect dataset provenance, and distinguish synthetic smoke experiments from research or production models. All trials, including failures, remain visible." });
}

if (isMain(import.meta.url)) await runStdio(() => buildServer(), "canlilabs-lab-pilot");
