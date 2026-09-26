import { z } from "zod";
import { compact, defineTool, ToolError } from "../kit/index.mjs";
import { searchIndex } from "../rfcindex.mjs";

export const MAX_RESULTS = 10;

export const searchRfcs = defineTool({
  name: "search_rfcs",
  title: "Search RFCs",
  description: "Finds RFCs by topic words in titles, keywords and abstracts; current documents rank above the ones they replaced. Returns number, title, status, year and what obsoletes each.",
  input: {
    query: z.string().min(2).max(200),
    include_obsolete: z.boolean().optional().describe("Default true"),
  },
  output: { total: z.number(), results: z.array(z.looseObject({ rfc: z.string(), title: z.string() })) },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  handler: async ({ query, include_obsolete = true }, { store }) => {
    const idx = await store.index();
    const hits = searchIndex(idx, query, { includeObsolete: include_obsolete });
    if (!hits.length) throw new ToolError("no_match", `No RFC matches every word of "${query}". Try fewer or broader words.`);
    return {
      total: hits.length,
      results: hits.slice(0, MAX_RESULTS).map((r) => compact({ rfc: `RFC ${r.n}`, title: r.title, status: r.status, year: r.year, obsoleted_by: r.obsoletedBy.length ? r.obsoletedBy.map((x) => `RFC ${x}`) : undefined })),
    };
  },
});
