import { z } from "zod";
import { clip, compact, defineTool } from "../kit/index.mjs";
import { judge } from "../compat.mjs";
import { expressionText, parseExpression } from "../licenses.mjs";
import { DISCLAIMER, loadData, projectLicense, READ_ONLY } from "./shared.mjs";

const ORDER = ["no", "unknown", "check", "yes"];

export const checkCompatibility = defineTool({
  name: "check_compatibility",
  title: "Can these licenses go in my project?",
  description: "Whether code under each of up to 100 licenses or SPDX expressions (MIT OR GPL-3.0-only, GPL-2.0-only WITH Classpath-exception-2.0) may be included in a project under yours (an SPDX id, or 'proprietary'): yes, no or check, with OSADL's reason. Worst first.",
  input: { project: z.string().max(80).describe("your project's license"), licenses: z.array(z.string().max(300)).min(1).max(100) },
  output: { project: z.string(), counts: z.record(z.string(), z.number()), results: z.array(z.looseObject({ license: z.string(), verdict: z.string() })) },
  annotations: READ_ONLY,
  handler: async ({ project: raw, licenses }, ctx) => {
    const data = await loadData(ctx);
    const project = projectLicense(data, raw);
    const results = licenses.map((l) => {
      const { tree } = parseExpression(data, l);
      const j = judge(data, project, tree);
      return compact({ license: l, expression: expressionText(tree) !== l ? expressionText(tree) : undefined, verdict: j.verdict, via: j.via, copyleft: j.copyleft, reason: j.reason && clip(j.reason, 400), note: j.note });
    });
    results.sort((a, b) => ORDER.indexOf(a.verdict) - ORDER.indexOf(b.verdict));
    const counts = Object.fromEntries(ORDER.map((v) => [v, results.filter((r) => r.verdict === v).length]).filter(([, n]) => n));
    return { project: project.id, counts, results, note: DISCLAIMER };
  },
});
