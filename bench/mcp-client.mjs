// A benchmark peer receives the SDK's system environment and its declared values only.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

export const MCP_CONNECTOR_SHA256 = createHash("sha256").update(readFileSync(new URL(import.meta.url))).digest("hex");

export function assertConnectorUnchanged() {
  if (createHash("sha256").update(readFileSync(new URL(import.meta.url))).digest("hex") !== MCP_CONNECTOR_SHA256) throw new Error("MCP connector changed during measurement.");
}

export async function connectMcp({ command, args = [], cwd, env, timeoutMs = 15_000 }) {
  const client = new Client({ name: "factory-measurement", version: "1" });
  let closing;
  const timer = setTimeout(() => { closing = client.close().catch(() => {}); }, timeoutMs);
  try {
    await client.connect(new StdioClientTransport({ command, args, cwd, env, stderr: "ignore" }), { timeout: timeoutMs });
    return client;
  } catch (error) {
    await (closing ?? client.close().catch(() => {}));
    throw error;
  } finally { clearTimeout(timer); }
}
