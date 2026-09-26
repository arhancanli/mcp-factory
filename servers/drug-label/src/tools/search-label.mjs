import { z } from "zod";
import { compact, defineTool, ToolError } from "../kit/index.mjs";
import { chooseLabel } from "../drugs.mjs";
import { headingOf, sectionsWithin, termPattern, topicOf } from "../spl.mjs";
import { choiceNote, citeLabel, READ_ONLY } from "./common.mjs";

export const MAX_MATCHES = 20;

export const searchLabel = defineTool({
  name: "search_label",
  title: "Search a label for a term",
  description: "Finds every paragraph of the official FDA label that mentions a term (another drug, grapefruit, alcohol, a condition), with its section heading and topic.",
  input: {
    drug: z.string().min(2).max(200).optional().describe("Drug name, NDC or label setid"),
    setid: z.string().min(36).max(36).optional(),
    term: z.string().min(2).max(100),
  },
  output: { label: z.looseObject({ setid: z.string() }), term: z.string(), total: z.number(), matches: z.array(z.looseObject({ heading: z.string(), text: z.string() })) },
  annotations: READ_ONLY,
  handler: async ({ drug, setid, term }, ctx) => {
    if (!term.trim()) throw new ToolError("empty_term", "Give a term to search for.");
    const choice = await chooseLabel(ctx, { drug, setid });
    const { label } = choice;
    const re = termPattern(term);
    const matches = [];
    for (const n of sectionsWithin(label)) for (const b of n.blocks) if (re.test(b)) matches.push(compact({ heading: headingOf(label, n), topic: topicOf(label, n), text: b.length > 1200 ? `${b.slice(0, 1200)} [clipped]` : b }));
    return { label: citeLabel(label), term, total: matches.length, matches: matches.slice(0, MAX_MATCHES), ...compact({ truncated: matches.length > MAX_MATCHES ? matches.length - MAX_MATCHES : undefined, choice: choiceNote(choice) }) };
  },
});
