import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { measureCall, renderPerf } from "../scripts/perf.mjs";

function fixture(t, mode = "ok") {
  const directory = mkdtempSync(path.join(os.tmpdir(), "canlilabs-perf-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const filename = path.join(directory, "server.mjs");
  const pidfile = path.join(directory, "pid");
  writeFileSync(filename, `
import { createInterface } from 'node:readline';
import { writeFileSync } from 'node:fs';
writeFileSync(process.argv[2], String(process.pid));
let calls = 0;
createInterface({ input: process.stdin }).on('line', line => {
 const request = JSON.parse(line);
 if (!('id' in request)) return;
 const send = result => process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:request.id,result})+'\\n');
 if (request.method === 'initialize') {
  if (${JSON.stringify(mode)} === 'stall') return;
  setTimeout(() => send({protocolVersion:request.params.protocolVersion,capabilities:{tools:{}},serverInfo:{name:'perf-probe',version:'1'}}),120);
 } else if (request.method === 'tools/call') {
  calls++;
  send({content:[{type:'text',text:JSON.stringify({calls,parent_credential:process.env.CANLILABS_PARENT_CREDENTIAL,declared:process.env.CANLILABS_DECLARED_ENV})}],isError:${JSON.stringify(mode)} === 'repeat-error' && calls > 1});
 }
});
`);
  return { command: process.execPath, args: [filename, pidfile], cwd: directory, pidfile };
}

test("cold-start timing includes delayed MCP initialize and keeps separate first-request timing", async (t) => {
  const server = fixture(t);
  const measured = await measureCall(server, { tool: "probe", args: {} }, { runs: 2, timeoutMs: 2000 });
  assert.ok(measured.startup_initialize_ms >= 100, JSON.stringify(measured));
  assert.ok(measured.first_call_ms >= measured.startup_initialize_ms);
  assert.ok(measured.first_request_ms < measured.first_call_ms);
  assert.ok(measured.result_chars > 0);
  assert.equal(measured.repeat_samples_ms.length, 2);
  assert.equal(measured.repeat_ms, Number(((measured.repeat_samples_ms[0] + measured.repeat_samples_ms[1]) / 2).toFixed(3)));
  assert.throws(() => process.kill(Number(readFileSync(server.pidfile, "utf8")), 0), { code: "ESRCH" });
});

test("measurement peers receive declared environment values without the parent's credentials", async (t) => {
  const original = process.env.CANLILABS_PARENT_CREDENTIAL;
  process.env.CANLILABS_PARENT_CREDENTIAL = "test-parent-only-value";
  t.after(() => { if (original === undefined) delete process.env.CANLILABS_PARENT_CREDENTIAL; else process.env.CANLILABS_PARENT_CREDENTIAL = original; });
  const server = { ...fixture(t), env: { CANLILABS_DECLARED_ENV: "allowed-value" } };
  const measured = await measureCall(server, { tool: "probe", args: {} }, { runs: 1, timeoutMs: 2000 });
  const observed = JSON.parse(measured.first_result.content[0].text);
  assert.equal(observed.parent_credential, undefined);
  assert.equal(observed.declared, "allowed-value");
});

test("a failed repeat cannot become a successful performance result and closes the process", async (t) => {
  const server = fixture(t, "repeat-error");
  await assert.rejects(measureCall(server, { tool: "probe", args: {} }, { runs: 2, timeoutMs: 2000 }), /tool error/);
  assert.throws(() => process.kill(Number(readFileSync(server.pidfile, "utf8")), 0), { code: "ESRCH" });
});

test("a stalled initialize is bounded and closes its child", async (t) => {
  const server = fixture(t, "stall");
  const started = performance.now();
  await assert.rejects(measureCall(server, { tool: "probe", args: {} }, { runs: 1, timeoutMs: 1000 }));
  assert.ok(performance.now() - started < 5000);
  assert.throws(() => process.kill(Number(readFileSync(server.pidfile, "utf8")), 0), { code: "ESRCH" });
});

test("legacy reports state the actual measured scope instead of claiming startup or caching", () => {
  const perf = {measured_on:"2026-09-26",where:"test",node:"v24.0.0",tool_definition_chars:100,scenarios:[{call:"probe",first_call_ms:2,repeat_ms:1,result_chars:10}]};
  assert.match(renderPerf(perf), /excludes process startup/);
  assert.doesNotMatch(renderPerf(perf), /answered from the in-process cache/);
  assert.match(renderPerf({...perf,timing_scope:"startup_initialize_first_call"}), /includes the stdio process start/);
});
