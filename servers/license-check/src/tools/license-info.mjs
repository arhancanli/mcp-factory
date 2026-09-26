import { z } from "zod";
import { compact, defineTool } from "../kit/index.mjs";
import { parseExpression, resolveId } from "../licenses.mjs";
import { loadData, READ_ONLY } from "./shared.mjs";

export const licenseInfo = defineTool({
  name: "license_info",
  title: "Identify licenses",
  description: "Identifies up to 20 licenses however they are written (\"Apache License 2.0\", \"GPLv3\", \"New BSD\", deprecated SPDX ids): SPDX id and name, OSI approved, FSF free, copyleft class and source-disclosure duty (OSADL), links to the text and OSADL's obligations checklist.",
  input: { licenses: z.array(z.string().max(300)).min(1).max(20) },
  output: { results: z.array(z.looseObject({ input: z.string() })) },
  annotations: READ_ONLY,
  handler: async ({ licenses }, ctx) => {
    const data = await loadData(ctx);
    const results = licenses.map((raw) => {
      const { tree, unknown } = parseExpression(data, raw);
      const ids = [];
      const walk = (t) => (t.license ? ids.push(t.license) : (t.and ?? t.or).forEach(walk));
      walk(tree);
      const rows = ids.map((id) => {
        const l = data.byId.get(id);
        if (!l) return { id, known: false };
        return compact({
          id,
          name: l.name,
          osi_approved: l.isOsiApproved,
          fsf_libre: l.isFsfLibre || undefined,
          deprecated: l.isDeprecatedLicenseId || undefined,
          copyleft: data.osadl.copyleft[id],
          source_disclosure: data.osadl.disclosure[id],
          text: `https://spdx.org/licenses/${id}.html`,
          obligations: data.osadl.known.has(id) ? `https://www.osadl.org/fileadmin/checklists/unreflicenses/${id}.txt` : undefined,
        });
      });
      const exact = resolveId(data, raw);
      return compact({ input: raw, ...(rows.length === 1 ? rows[0] : { licenses: rows }), written_as: exact && exact !== raw.trim() && rows.length === 1 ? raw : undefined, unknown: unknown.length ? unknown : undefined, note: unknown.length ? `Not an SPDX license: ${unknown.join(", ")}.` : undefined });
    });
    return { results };
  },
});
