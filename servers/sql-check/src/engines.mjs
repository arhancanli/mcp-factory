// One isolated engine process per dialect, with a lightweight supervisor for parent-death cleanup.
import { fork } from "node:child_process";
import { ToolError } from "./kit/index.mjs";

const SUPERVISOR = new URL("./supervisor.mjs", import.meta.url);
export const DEFAULT_TIMEOUT_MS = 10_000;
export const engineEnvironment = () => Object.fromEntries(
  ["PATH", "LANG", "LC_ALL", "LC_CTYPE", "TZ", "TMPDIR", "TMP", "TEMP", "SYSTEMROOT", "WINDIR"]
    .filter((name) => process.env[name] !== undefined).map((name) => [name, process.env[name]]),
);

function spawn() {
  const worker = fork(SUPERVISOR, [], { execArgv: [], env: engineEnvironment(), stdio: ["ignore", "ignore", "ignore", "ipc"] });
  const slot = { worker, nextId: 1, enginePid: null, exited: false };
  slot.exit = new Promise((resolve) => {
    worker.once("exit", () => { slot.exited = true; resolve(); });
    worker.on("error", () => { if (!worker.pid) { slot.exited = true; resolve(); } });
  });
  worker.on("error", () => {});
  worker.unref();
  worker.channel?.unref();
  return slot;
}

function shutdown(slot) {
  if (!slot || slot.exited) return Promise.resolve();
  slot.worker.ref();
  slot.worker.channel?.ref();
  // The supervisor first kills/reaps its engine, then exits. Killing a supervisor
  // directly could otherwise leave a busy engine behind.
  if (slot.worker.connected) slot.worker.send({ shutdown: true }, () => {});
  return slot.exit;
}

export function runJob(ctx, job, { timeoutMs = ctx.timeoutMs ?? DEFAULT_TIMEOUT_MS } = {}) {
  if (!["postgres", "sqlite"].includes(job.dialect) || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120_000) {
    return Promise.reject(new ToolError("invalid_engine_request", "Use a supported dialect and a 1-120000 ms deadline."));
  }
  ctx.engines ??= {};
  ctx.engineQueues ??= {};
  const run = (ctx.engineQueues[job.dialect] ?? Promise.resolve()).then(() => {
    if (ctx.enginesStopped) throw new ToolError("engine_stopped", "The SQL engines are stopped.");
    const previous = ctx.engines[job.dialect];
    const slot = previous && !previous.exited ? previous : (ctx.engines[job.dialect] = spawn());
    return new Promise((resolve, reject) => {
      const { worker } = slot;
      const id = slot.nextId++;
      let at = { phase: "schema", index: 0 };
      let finished = false;
      const done = () => {
        if (finished) return false;
        finished = true;
        clearTimeout(timer);
        worker.off("message", onMessage);
        worker.off("error", onError);
        worker.off("exit", onExit);
        worker.unref();
        worker.channel?.unref();
        return true;
      };
      const onMessage = (message) => {
        if (message.id !== id) return;
        if (message.engine_pid) slot.enginePid = message.engine_pid;
        if (message.progress) { at = message.progress; return; }
        if (!done()) return;
        if (message.timed_out) {
          if (ctx.engines[job.dialect] === slot) ctx.engines[job.dialect] = undefined;
          shutdown(slot).catch(() => {});
          reject(timeout());
        } else if (message.error) reject(new ToolError("engine_failed", `The ${job.dialect} engine stopped; its process was isolated.`));
        else resolve(message.result);
      };
      const onError = () => {
        if (!done()) return;
        if (ctx.engines[job.dialect] === slot) ctx.engines[job.dialect] = undefined;
        shutdown(slot).catch(() => {});
        reject(new ToolError("engine_failed", `The ${job.dialect} engine stopped; retry on a fresh in-memory engine.`));
      };
      const onExit = () => onError();
      const timeout = () => new ToolError("timeout", `Statement ${at.index + 1} of the ${at.phase === "schema" ? "schema" : "SQL"} did not finish within ${timeoutMs / 1000} s and was stopped (an unbounded recursive query or a very large generate_series?). Nothing after it was checked.`, at);
      const timer = setTimeout(() => {
        if (!done()) return;
        if (ctx.engines[job.dialect] === slot) ctx.engines[job.dialect] = undefined;
        shutdown(slot).catch(() => {});
        reject(timeout());
      }, timeoutMs);
      worker.ref();
      worker.channel?.ref();
      worker.on("message", onMessage);
      worker.on("error", onError);
      worker.on("exit", onExit);
      worker.send({ job: { ...job, id }, timeoutMs }, (error) => { if (error) onError(); });
    });
  });
  ctx.engineQueues[job.dialect] = run.catch(() => {});
  return run;
}

export function warm(ctx) {
  for (const dialect of ["postgres", "sqlite"]) runJob(ctx, { dialect, schema: "", sql: "SELECT 1", maxRows: 1 }).catch(() => {});
}

export async function stopEngines(ctx) {
  ctx.enginesStopped = true;
  await Promise.all(Object.values(ctx.engines ?? {}).map(shutdown));
  ctx.engines = {};
}
