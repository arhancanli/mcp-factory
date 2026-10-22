// No WebAssembly executes here: this process can always kill a blocked engine
// when a job expires or the MCP parent disconnects, including after SIGKILL.
import { fork } from "node:child_process";

let engine, active, timer, expired = false, closing = false;
const send = (message) => { if (process.connected) process.send(message, () => {}); };
const clear = () => { clearTimeout(timer); timer = undefined; active = undefined; };
const stop = () => {
  if (closing) return;
  closing = true;
  clear();
  if (!engine) process.exit(0);
  else engine.kill("SIGKILL");
};
const spawn = () => {
  const child = fork(new URL("./worker.mjs", import.meta.url), [], {
    execArgv: ["--max-old-space-size=512"], env: process.env,
    stdio: ["ignore", "ignore", "ignore", "ipc"],
  });
  engine = child;
  child.on("message", (message) => {
    if (message.id !== active) return;
    send({ ...message, engine_pid: child.pid });
    if (!message.progress) clear();
  });
  child.on("error", () => {
    if (child.pid) child.kill("SIGKILL");
    else {
      engine = undefined;
      send({ id: active, error: "isolated engine could not start" });
      clear();
      if (closing) process.exit(0);
    }
  });
  child.on("exit", () => {
    if (engine === child) engine = undefined;
    if (active !== undefined) send({ id: active, error: "isolated engine exited", timed_out: expired });
    clear();
    if (closing) process.exit(0);
  });
  return child;
};
process.on("message", (message) => {
  if (message.shutdown) { stop(); return; }
  if (closing || active !== undefined) return;
  const child = engine ?? spawn();
  active = message.job.id;
  expired = false;
  // The supervisor enforces the same deadline even if the MCP parent stalls.
  timer = setTimeout(() => { expired = true; child.kill("SIGKILL"); }, message.timeoutMs);
  child.send(message.job, (error) => { if (error) child.kill("SIGKILL"); });
});
process.on("disconnect", stop);
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
