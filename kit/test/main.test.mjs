import assert from "node:assert/strict";
import { once } from "node:events";
import { request } from "node:http";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { z } from "zod";
import { createServer, defineTool } from "../tool.mjs";
import { MAX_HTTP_BODY_BYTES, runHttp } from "../main.mjs";

const echo = defineTool({
  name: "echo_word", title: "Echo a word", description: "Returns a bounded word.",
  input: { word: z.string().max(20) }, output: { word: z.string() },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler: async ({ word }) => ({ word }),
});

function rawRequest(url, { method = "GET", headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = request(url, { method, headers }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => resolve({ status: response.statusCode, body: Buffer.concat(chunks).toString("utf8") }));
      response.on("error", reject);
    });
    req.on("error", reject);
    req.end(body);
  });
}

async function fixture(t, options = {}) {
  let builds = 0;
  const server = runHttp(() => {
    builds++;
    return createServer({ name: "http-probe", version: "0.1.0", tools: [echo], ctx: {} });
  }, { port: 0, label: "http-probe", ...options });
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });
  await once(server, "listening");
  const origin = `http://127.0.0.1:${server.address().port}`;
  return { server, origin, endpoint: `${origin}/mcp`, builds: () => builds };
}

test("HTTP defaults to loopback, rejects unrelated Host/Origin before creating tools, and keeps service clients working", async (t) => {
  const f = await fixture(t);
  assert.equal(f.server.address().address, "127.0.0.1");
  const health = await fetch(`${f.origin}/healthz`);
  assert.deepEqual(await health.json(), { ok: true });
  for (const headers of [{ Origin: "https://unrelated.example" }, { Origin: "null" }, { Host: "rebound.example" }]) {
    const response = await rawRequest(f.endpoint, { method: "POST", headers, body: "{}" });
    assert.equal(response.status, 403, JSON.stringify(headers));
  }
  assert.equal(f.builds(), 0);
  const client = new Client({ name: "http-test", version: "1" });
  t.after(() => client.close());
  await client.connect(new StreamableHTTPClientTransport(new URL(f.endpoint), { requestInit: { headers: { Origin: f.origin } } }));
  assert.equal((await client.listTools()).tools[0].name, "echo_word");
  const answer = await client.callTool({ name: "echo_word", arguments: { word: "hello" } });
  assert.deepEqual(answer.structuredContent, { word: "hello" });
  assert.ok(f.builds() >= 3, "each stateless request gets its own server context");
});

test("remote HTTP binding requires trusted hosts and rejects every undeclared browser origin", async (t) => {
  assert.throws(() => runHttp(() => {}, { host: "0.0.0.0", allowedHosts: [] }), /MCP_ALLOWED_HOSTS/);
  assert.throws(() => runHttp(() => {}, { allowedHosts: ["*.example.org"] }), /exact hostnames/);
  assert.throws(() => runHttp(() => {}, { allowedOrigins: ["https://app.example.org/path"] }), /without paths/);
  const f = await fixture(t, { host: "0.0.0.0", allowedHosts: ["mcp.example.org"], allowedOrigins: ["https://app.example.org"] });
  const rejected = await rawRequest(`${f.origin}/healthz`, { headers: { Host: "mcp.example.org", Origin: "https://wrong.example.org" } });
  assert.equal(rejected.status, 403);
  const allowed = await rawRequest(`${f.origin}/healthz`, { headers: { Host: "mcp.example.org", Origin: "https://app.example.org" } });
  assert.equal(allowed.status, 200);
  const noOrigin = await rawRequest(`${f.origin}/healthz`, { headers: { Host: "mcp.example.org" } });
  assert.equal(noOrigin.status, 200);
});

test("HTTP returns bounded protocol errors for unsupported methods, malformed JSON and oversized bodies", async (t) => {
  const f = await fixture(t);
  assert.equal((await fetch(f.endpoint)).status, 405);
  const malformed = await fetch(f.endpoint, { method: "POST", body: "not-json" });
  assert.equal(malformed.status, 400);
  assert.equal((await malformed.json()).error.code, -32700);
  const oversized = await fetch(f.endpoint, { method: "POST", body: "x".repeat(MAX_HTTP_BODY_BYTES + 1) });
  assert.equal(oversized.status, 413);
  assert.equal(f.builds(), 0);
});
