import { z } from "zod";
import { defineTool, ToolError } from "../kit/index.mjs";
import { checkCitations, MAX_REFERENCES, splitReferences } from "../check.mjs";

const row = z.looseObject({
  n: z.number(),
  verdict: z.enum(["verified", "mismatch", "not_found", "unverifiable"]),
  flags: z.array(z.string()).optional(),
});

export const checkReferences = defineTool({
  name: "check_references",
  title: "Check a reference list",
  description:
    "Checks up to 30 citations (a pasted reference list, one per line or numbered, or BibTeX) against Crossref, DataCite, PubMed and OpenAlex. Verdict each: verified, mismatch (wrong field, or DOI of another work), not_found (possibly fabricated) or unverifiable; flags retractions and corrections. bibtex=true adds corrected BibTeX.",
  input: {
    text: z.string().min(1).max(300_000).describe("Reference list or BibTeX"),
    bibtex: z.boolean().optional().describe("Include corrected BibTeX per reference"),
  },
  output: { counts: z.record(z.string(), z.number()), results: z.array(row), truncated: z.number().optional() },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  handler: async ({ text, bibtex }, ctx) => {
    const all = splitReferences(text);
    if (!all.length) throw new ToolError("no_references", "No citations found in the text. Paste one reference per line, a numbered list, or BibTeX entries.");
    const cites = all.slice(0, MAX_REFERENCES);
    const out = await checkCitations(ctx, cites, { bibtex });
    if (all.length > cites.length) out.truncated = all.length - cites.length;
    return out;
  },
});
