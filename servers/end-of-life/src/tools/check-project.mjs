import { z } from "zod";
import { compact, defineTool, mapLimit, ToolError } from "../kit/index.mjs";
import { describe, productReleases, resolveProduct, upgradeTarget } from "../eol.mjs";
import { detect, SUPPORTED_FILES } from "../detect.mjs";
import { countRows, READ_ONLY, sortRows } from "./check-versions.mjs";

export const checkProject = defineTool({
  name: "check_project",
  title: "Check a project's runtimes",
  description: `Finds the runtime, database and OS versions a project pins in its files (${SUPPORTED_FILES}) and checks each against endoflife.date, with file and line. Pass each file's path and text.`,
  input: {
    files: z.array(z.object({ path: z.string().min(1).max(300), content: z.string().max(200_000) })).min(1).max(30),
  },
  output: { counts: z.record(z.string(), z.number()), results: z.array(z.looseObject({ product: z.string(), status: z.string() })) },
  annotations: READ_ONLY,
  handler: async ({ files }, ctx) => {
    const now = ctx.now?.() ?? Date.now();
    const { findings, unrecognised } = detect(files.map((f) => ({ name: f.path, content: f.content })));
    if (!findings.length) throw new ToolError("nothing_found", `No pinned runtime or OS version found. Recognised files: ${SUPPORTED_FILES}.`, unrecognised.length ? { unrecognised } : undefined);
    const byProduct = new Map();
    const rows = await mapLimit(findings, 6, async (f) => {
      try {
        const name = await resolveProduct(ctx, f.product);
        if (!byProduct.has(name)) byProduct.set(name, productReleases(ctx, name));
        const p = await byProduct.get(name);
        let version = f.version;
        if (!version && f.codename === "*") version = upgradeTarget(p.releases, now)?.cycle;
        if (!version && f.codename) version = p.releases.find((r) => String(r.codename ?? "").toLowerCase() === f.codename)?.name;
        const d = describe(p, p.releases, version ?? f.codename ?? "", now);
        return compact({ ...d, file: f.file, line: f.line, found: f.source });
      } catch (err) {
        if (err instanceof ToolError) return { product: f.product, version: f.version, status: err.code, file: f.file, line: f.line, note: err.message };
        throw err;
      }
    });
    return { counts: countRows(rows), results: sortRows(rows), ...compact({ unrecognised_files: unrecognised }) };
  },
});
