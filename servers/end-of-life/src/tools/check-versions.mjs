import { z } from "zod";
import { defineTool, mapLimit, ToolError } from "../kit/index.mjs";
import { describe, productReleases, resolveProduct } from "../eol.mjs";

export const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };
export const STATUS_ORDER = ["end_of_life", "extended_only", "security_only", "unknown_version", "upcoming", "supported"];
const row = z.looseObject({ product: z.string(), version: z.string().optional(), status: z.string() });

/** "python 3.8", "node@18", "postgres:13", "ubuntu 20.04", "Django v4.2" -> {product, version}. */
export function splitItem(raw) {
  const m = String(raw).trim().match(/^(.+?)[\s@:=]+v?(\d[\w.+-]*)$/i) ?? String(raw).trim().match(/^([a-z][a-z.-]*?)v?(\d[\w.+-]*)$/i);
  return m ? { product: m[1].trim(), version: m[2] } : undefined;
}

export async function checkOne(ctx, product, version, now) {
  const name = await resolveProduct(ctx, product);
  const p = await productReleases(ctx, name);
  return describe(p, p.releases, version, now);
}

export const sortRows = (rows) => [...rows].sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status));
export const countRows = (rows) => Object.fromEntries(STATUS_ORDER.map((s) => [s, rows.filter((r) => r.status === s).length]).filter(([, n]) => n));

export const checkVersions = defineTool({
  name: "check_versions",
  title: "Check versions for end of life",
  description: "Checks up to 50 'product version' pairs (python 3.8, node@18, postgres:13, ubuntu 20.04, django 4.2) against endoflife.date: status (supported, security_only, extended_only, end_of_life, upcoming), end-of-life date, days left, latest patch and the version to upgrade to. Worst first.",
  input: { items: z.array(z.string().min(3).max(100)).min(1).max(50) },
  output: { counts: z.record(z.string(), z.number()), results: z.array(row) },
  annotations: READ_ONLY,
  handler: async ({ items }, ctx) => {
    const now = ctx.now?.() ?? Date.now();
    const rows = await mapLimit(items, 6, async (raw) => {
      const parsed = splitItem(raw);
      if (!parsed) return { product: raw, status: "unreadable", note: "Write it as 'product version', for example 'python 3.8'." };
      try {
        return await checkOne(ctx, parsed.product, parsed.version, now);
      } catch (err) {
        if (err instanceof ToolError) return { product: parsed.product, version: parsed.version, status: err.code, note: err.message };
        throw err;
      }
    });
    return { counts: countRows(rows), results: sortRows(rows) };
  },
});
