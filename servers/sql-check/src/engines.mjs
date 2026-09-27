// src/engines.mjs
//
// The main thread's side of src/worker.mjs: one worker per dialect, one job at a time, a time limit
// per job. A job that runs over it (a recursive query without an end, a generate_series of a
// billion rows) has its worker terminated and replaced, and is reported against the statement that
// was running.
import { Worker } from "node:worker_threads";
import { ToolError } from "./kit/index.mjs";

const WORKER = new URL("./worker.mjs", import.meta.url);
export const DEFAULT_TIMEOUT_MS = 10_000;

function spawn() {
  const worker = new Worker(WORKER, { resourceLimits: { maxOldGenerationSizeMb: 512 } });
  worker.unref();
  return { worker, queue: Promise.resolve(), nextId: 1 };
}

/** Runs one job ({dialect, schema, sql, maxRows}); resolves to the worker's result. */
export function runJob(ctx, job, { timeoutMs = ctx.timeoutMs ?? DEFAULT_TIMEOUT_MS } = {}) {
  ctx.engines ??= {};
  const slot = (ctx.engines[job.dialect] ??= spawn());
  const run = slot.queue.then(
    () =>
      new Promise((resolve, reject) => {
        const { worker } = slot;
        const id = slot.nextId++;
        let at = { phase: "schema", index: 0 };
        const done = () => {
          clearTimeout(timer);
          worker.off("message", onMessage);
          worker.off("error", onError);
          worker.off("exit", onExit);
        };
        const onMessage = (m) => {
          if (m.id !== id) return;
          if (m.progress) {
            at = m.progress;
            return;
          }
          done();
          if (m.error) reject(new ToolError("engine_failed", `The ${job.dialect} engine failed: ${m.error.slice(0, 200)}`));
          else resolve(m.result);
        };
        const onError = (e) => {
          done();
          ctx.engines[job.dialect] = undefined;
          reject(new ToolError("engine_failed", `The ${job.dialect} engine stopped: ${String(e?.message ?? e).slice(0, 200)}`));
        };
        const onExit = () => onError(new Error("the engine exited"));
        const timer = setTimeout(() => {
          done();
          ctx.engines[job.dialect] = undefined;
          worker.terminate();
          const err = new ToolError("timeout", `Statement ${at.index + 1} of the ${at.phase === "schema" ? "schema" : "SQL"} did not finish within ${timeoutMs / 1000} s and was stopped (an unbounded recursive query or a very large generate_series?). Nothing after it was checked.`, at);
          reject(err);
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

/** Starts the engines ahead of the first call (PostgreSQL takes about a second to start). */
export function warm(ctx) {
  for (const dialect of ["postgres", "sqlite"]) runJob(ctx, { dialect, schema: "", sql: "SELECT 1", maxRows: 1 }).catch(() => {});
}

export async function stopEngines(ctx) {
  for (const slot of Object.values(ctx.engines ?? {})) await slot?.worker.terminate();
  ctx.engines = {};
}
