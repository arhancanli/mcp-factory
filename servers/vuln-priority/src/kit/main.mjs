// kit/main.mjs
//
// Entry points shared by every factory server: stdio for local installs (npx, Claude Desktop,
// Cursor, VS Code) and a stateless Streamable HTTP endpoint for hosting. Stateless means each POST
// builds a fresh server and transport, so any instance can answer any request and nothing
// leaks between callers.
import http from "node:http";
import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

export const MAX_HTTP_BODY_BYTES = 1024 * 1024;

/** True when the importing module is the process entry point (works through npm bin symlinks). */
export function isMain(importMetaUrl) {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return importMetaUrl === pathToFileURL(realpathSync(entry)).href;
  } catch {
    return false;
  }
}

export async function runStdio(buildServer, label) {
  const server = buildServer();
  await server.connect(new StdioServerTransport());
  const stop = () => server.close().finally(() => process.exit(0));
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  process.stderr.write(`${label}: ready on stdio\n`);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    let rejected = false;
    req.on("data", (c) => {
      if (rejected) return;
      total += c.length;
      if (total > MAX_HTTP_BODY_BYTES) {
        rejected = true;
        chunks.length = 0;
        reject(Object.assign(new Error("too large"), { status: 413 }));
      } else chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

const sendJson = (res, status, body) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
};

const envList = (name) => (process.env[name] ?? "").split(",").map((v) => v.trim()).filter(Boolean);
const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1"]);

function authority(value) {
  try {
    const url = new URL(`http://${value}`);
    if (url.username || url.password || url.pathname !== "/" || url.search || url.hash || !url.hostname || url.hostname.includes("*")) return null;
    return url;
  } catch {
    return null;
  }
}

/** Local HTTP is loopback-only. Remote binding requires an explicit trusted Host list. */
export function runHttp(buildServer, {
  port = Number(process.env.PORT ?? 3000),
  host = process.env.MCP_HTTP_HOST ?? "127.0.0.1",
  allowedHosts = envList("MCP_ALLOWED_HOSTS"),
  allowedOrigins = envList("MCP_ALLOWED_ORIGINS"),
  label = "mcp",
} = {}) {
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error("PORT must be an integer from 0 to 65535.");
  if (!LOOPBACK.has(host) && allowedHosts.length === 0) throw new Error("Remote HTTP binding requires MCP_ALLOWED_HOSTS with the trusted public hostnames.");
  const hosts = (allowedHosts.length ? allowedHosts : ["127.0.0.1", "localhost", "[::1]"]).map(authority);
  if (hosts.some((v) => !v)) throw new Error("MCP_ALLOWED_HOSTS must contain exact hostnames, optionally with ports, without wildcards or paths.");
  for (const origin of allowedOrigins) {
    let url;
    try { url = new URL(origin); } catch { throw new Error("MCP_ALLOWED_ORIGINS must contain exact HTTP or HTTPS origins."); }
    if (!["http:", "https:"].includes(url.protocol) || url.origin !== origin) throw new Error("MCP_ALLOWED_ORIGINS must contain exact HTTP or HTTPS origins without paths.");
  }
  const httpServer = http.createServer({ requestTimeout: 20_000, headersTimeout: 10_000, maxHeaderSize: 8192 }, async (req, res) => {
    // Validate before reading a body or creating a tool context. Host prevents DNS rebinding;
    // Origin blocks an unrelated browser site from using a local or hosted MCP endpoint.
    const requested = authority(req.headers.host ?? "");
    if (!requested || !hosts.some((trusted) => trusted.hostname === requested.hostname && (!trusted.port || trusted.port === requested.port))) {
      return sendJson(res, 403, { error: "Untrusted Host header." });
    }
    const origin = req.headers.origin;
    const actualPort = httpServer.address()?.port;
    const origins = allowedOrigins.length ? allowedOrigins : LOOPBACK.has(host)
      ? ["127.0.0.1", "localhost", "[::1]"].map((name) => `http://${name}:${actualPort}`) : [];
    if (origin !== undefined && !origins.includes(origin)) return sendJson(res, 403, { error: "Untrusted Origin header." });
    let path;
    try { path = new URL(req.url ?? "/", "http://x").pathname; } catch { return sendJson(res, 400, { error: "Invalid request path." }); }
    if (path === "/healthz") return req.method === "GET" ? sendJson(res, 200, { ok: true }) : sendJson(res, 405, { error: "Use GET for health checks." });
    if (path !== "/mcp") return sendJson(res, 404, { error: "not found" });
    if (req.method !== "POST") return sendJson(res, 405, { jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed: this endpoint is stateless, use POST." }, id: null });
    let body;
    try {
      body = JSON.parse(await readBody(req));
    } catch (err) {
      return sendJson(res, err.status ?? 400, { jsonrpc: "2.0", error: { code: -32700, message: err.status === 413 ? "Request body too large." : "Parse error." }, id: null });
    }
    const server = buildServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on("close", () => {
      void Promise.allSettled([transport.close(), server.close()]);
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, body);
    } catch (err) {
      process.stderr.write(`${label}: http request failed: ${err?.name ?? "Error"}\n`);
      if (!res.headersSent) sendJson(res, 500, { jsonrpc: "2.0", error: { code: -32603, message: "Internal error." }, id: null });
    }
  });
  httpServer.maxConnections = 128;
  httpServer.listen(port, host, () => process.stderr.write(`${label}: listening on http://${host}:${httpServer.address().port}/mcp\n`));
  return httpServer;
}

/** `node server.mjs` -> stdio; `node server.mjs --http` or MCP_TRANSPORT=http -> HTTP. */
export function start(buildServer, label) {
  const wantsHttp = process.argv.includes("--http") || process.env.MCP_TRANSPORT === "http";
  if (wantsHttp) return runHttp(buildServer, { label });
  return runStdio(buildServer, label).catch((err) => {
    process.stderr.write(`${label}: fatal: ${err?.message}\n`);
    process.exit(1);
  });
}
