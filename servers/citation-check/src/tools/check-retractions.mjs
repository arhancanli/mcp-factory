import { z } from "zod";
import { compact, defineTool, ToolError } from "../kit/index.mjs";
import { cleanDoi } from "../ids.mjs";
import { crossrefByDois, flagForUpdate } from "../sources.mjs";

const ORDER = ["retracted", "partially_retracted", "expression_of_concern", "corrected"];

export const checkRetractions = defineTool({
  name: "check_retractions",
  title: "Check DOIs for retractions",
  description: "Fast batch check of up to 200 DOIs for retractions, partial retractions, expressions of concern and corrections (Crossref, including Retraction Watch data). Status each: retracted, partially_retracted, expression_of_concern, corrected, none or not_in_crossref.",
  input: { dois: z.array(z.string().min(6).max(300)).min(1).max(200) },
  output: {
    counts: z.record(z.string(), z.number()),
    results: z.array(z.looseObject({ doi: z.string(), status: z.string() })),
  },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  handler: async ({ dois }, ctx) => {
    const cleaned = dois.map((d) => ({ input: d, doi: cleanDoi(d) }));
    const bad = cleaned.filter((x) => !x.doi);
    if (bad.length === cleaned.length) throw new ToolError("no_dois", "None of the inputs is a DOI (10.xxxx/...).");
    const records = await crossrefByDois(ctx, [...new Set(cleaned.filter((x) => x.doi).map((x) => x.doi))]);
    const results = cleaned.map(({ input, doi }) => {
      if (!doi) return { doi: input, status: "not_a_doi" };
      const r = records.get(doi);
      if (!r) return { doi, status: "not_in_crossref" };
      const flags = new Set((r.updates ?? []).map((u) => flagForUpdate(u.type)).filter(Boolean));
      if (/^\s*retracted\b/i.test(r.title)) flags.add("retracted");
      const status = ORDER.find((f) => flags.has(f)) ?? "none";
      const notices = (r.updates ?? []).filter((u) => flagForUpdate(u.type)).map((u) => compact({ type: u.type, notice_doi: u.doi, date: u.date }));
      return compact({ doi, status, title: r.title, notices });
    });
    const counts = {};
    for (const r of results) counts[r.status] = (counts[r.status] ?? 0) + 1;
    const rank = (s) => (ORDER.includes(s) ? ORDER.indexOf(s) : ORDER.length + (s === "none" ? 1 : 0));
    return { counts, results: [...results].sort((a, b) => rank(a.status) - rank(b.status)) };
  },
});
