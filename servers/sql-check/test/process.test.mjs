// Actual process boundaries, cancellation/queue recovery and cleanup after SIGKILL.
import assert from "node:assert/strict";
import test from "node:test";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { runJob, stopEngines, DEFAULT_TIMEOUT_MS } from "../src/engines.mjs";

const job = (sql) => ({ dialect: "postgres", schema: "", sql, maxRows: 1 });
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (error) { if (error.code === "ESRCH") return false; throw error; } };
const waitGone = async (pid) => {
  const deadline = Date.now() + 3000;
  while (alive(pid) && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 20));
  return !alive(pid);
};

test("a native engine signal is contained and a later job succeeds in a replacement process", async () => {
  const ctx = {};
  try {
    await runJob(ctx, job("SELECT 1"));
    const supervisor = ctx.engines.postgres.worker;
    const enginePid = ctx.engines.postgres.enginePid;
    process.kill(enginePid, "SIGTRAP");
    // A new request after a genuine crash must use a replacement engine.
    assert.equal(await waitGone(enginePid), true);
    const result = await runJob(ctx, job("SELECT 42"));
    assert.deepEqual(result.sql[0].rows, [[42]]);
    assert.notEqual(ctx.engines.postgres.enginePid, enginePid);
    assert.equal(ctx.engines.postgres.worker.pid, supervisor.pid);
  } finally { await stopEngines(ctx); }
});

test("a request queued behind a timed-out query runs on a live replacement engine", async () => {
  const ctx = {};
  try {
    await runJob(ctx, job("SELECT 1"));
    const doomed = ctx.engines.postgres.enginePid;
    const stuck = runJob(ctx, job("WITH RECURSIVE r(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM r) SELECT count(*) FROM r"), { timeoutMs: 200 });
    const queued = runJob(ctx, job("SELECT 42"), { timeoutMs: DEFAULT_TIMEOUT_MS });
    await assert.rejects(stuck, (error) => error.code === "timeout");
    assert.deepEqual((await queued).sql[0].rows, [[42]]);
    assert.equal(await waitGone(doomed), true);
  } finally { await stopEngines(ctx); }
});

test("killing the MCP parent also stops its supervisor and an already-running infinite query", async (t) => {
  const module = new URL("../src/engines.mjs", import.meta.url).href;
  const source = `import {runJob} from ${JSON.stringify(module)};
    const ctx={}; await runJob(ctx,{dialect:'postgres',schema:'',sql:'SELECT 1',maxRows:1});
    const supervisor=ctx.engines.postgres.worker;
    supervisor.on('message',m=>{if(m.progress?.phase==='sql') process.stdout.write(JSON.stringify({supervisor:supervisor.pid,engine:m.engine_pid})+'\\n');});
    runJob(ctx,{dialect:'postgres',schema:'',sql:'WITH RECURSIVE r(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM r) SELECT count(*) FROM r',maxRows:1}).catch(()=>{});`;
  const parent = spawn(process.execPath, ["--input-type=module", "-e", source], { env: { PATH: process.env.PATH }, stdio: ["ignore", "pipe", "pipe"] });
  t.after(() => parent.kill("SIGKILL"));
  let stdout = "";
  let stderr = "";
  parent.stderr.on("data", (bytes) => { stderr += bytes; });
  const boundary = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`The query did not start: ${stderr.slice(0, 200)}`)), 10000);
    parent.once("error", (error) => { clearTimeout(timer); reject(error); });
    parent.stdout.on("data", (bytes) => {
      stdout += bytes;
      if (stdout.includes("\n")) { clearTimeout(timer); resolve(JSON.parse(stdout.split("\n")[0])); }
    });
  });
  const pids = await boundary;
  assert.equal(alive(pids.supervisor), true);
  assert.equal(alive(pids.engine), true);
  const exited = once(parent, "exit");
  parent.kill("SIGKILL");
  await exited;
  assert.equal(await waitGone(pids.engine), true, "the busy engine is killed and reaped");
  assert.equal(await waitGone(pids.supervisor), true, "the supervisor exits after parent disconnect");
});
