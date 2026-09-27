// src/engines.mjs
//
// The main thread's side of src/worker.mjs: one worker per engine, one job at a time, a time limit
// per job. A pattern that backtracks past the limit has its worker terminated and replaced, so one
// engine stuck on one input never blocks the others or the server.
import { Worker } from "node:worker_threads";
import { ToolError } from "./kit/index.mjs";

const WORKER = new URL("./worker.mjs", import.meta.url);
export const DEFAULT_TIMEOUT_MS = 5_000;

function spawn(flavor) {
  const worker = new Worker(WORKER, { workerData: { flavor }, resourceLimits: { maxOldGenerationSizeMb: 512 } });
  worker.unref();
  return { worker, queue: Promise.resolve(), nextId: 1 };
}

/** Runs one job on one engine ({flavor, op, ...}); resolves to the worker's result. */
export function runJob(ctx, job, { timeoutMs = ctx.timeoutMs ?? DEFAULT_TIMEOUT_MS } = {}) {
  ctx.engines ??= {};
  const slot = (ctx.engines[job.flavor] ??= spawn(job.flavor));
  const run = slot.queue.then(
    () =>
      new Promise((resolve, reject) => {
        const { worker } = slot;
        const id = slot.nextId++;
        const done = () => {
          clearTimeout(timer);
          worker.off("message", onMessage);
          worker.off("error", onError);
          worker.off("exit", onExit);
        };
        const onMessage = (m) => {
          if (m.id !== id) return;
          done();
          if (m.error) reject(new ToolError("engine_failed", `The ${job.flavor} engine failed: ${m.error.slice(0, 200)}`));
          else resolve(m.result);
        };
        const onError = (e) => {
          done();
          ctx.engines[job.flavor] = undefined;
          reject(new ToolError("engine_failed", `The ${job.flavor} engine stopped: ${String(e?.message ?? e).slice(0, 200)}`));
        };
        const onExit = () => onError(new Error("the engine exited"));
        const timer = setTimeout(() => {
          done();
          ctx.engines[job.flavor] = undefined;
          worker.terminate();
          reject(new ToolError("timeout", `did not finish within ${timeoutMs / 1000} s`, { timeoutMs }));
        }, timeoutMs);
        worker.on("message", onMessage);
        worker.on("error", onError);
        worker.on("exit", onExit);
        worker.postMessage({ ...job, id });
      }),
  );
  slot.queue = run.catch(() => {});
  return run;
}

export const FLAVORS = ["javascript", "python", "pcre", "re2"];

/** Starts the engines ahead of the first call (Python takes about a second to start). */
export function warm(ctx) {
  for (const flavor of FLAVORS) runJob(ctx, { flavor, op: "test", pattern: "a", flags: "", inputs: ["a"], maxMatches: 1 }).catch(() => {});
}

export async function stopEngines(ctx) {
  for (const slot of Object.values(ctx.engines ?? {})) await slot?.worker.terminate();
  ctx.engines = {};
}
