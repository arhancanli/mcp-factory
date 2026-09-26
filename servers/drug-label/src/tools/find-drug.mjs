import { z } from "zod";
import { compact, defineTool } from "../kit/index.mjs";
import { describeDrug, rankLabels, resolveWithCandidates } from "../drugs.mjs";
import { READ_ONLY } from "./common.mjs";

export const findDrug = defineTool({
  name: "find_drug",
  title: "Identify a drug",
  description: "Resolves a brand or generic name, misspelling or NDC through RxNorm: ingredients, brands, FDA classes, and the best manufacturer labels (not repackagers) with set ids. Never guesses between look-alike names.",
  input: { name: z.string().min(2).max(200).describe("Drug name or NDC") },
  output: { rxcui: z.string(), name: z.string(), labels: z.array(z.looseObject({ setid: z.string() })) },
  annotations: READ_ONLY,
  handler: async ({ name }, ctx) => {
    const { resolved: drug, candidates } = await resolveWithCandidates(ctx, name);
    const info = await describeDrug(ctx, drug);
    const { total, labels } = candidates;
    const ranked = rankLabels(labels, drug);
    return {
      ...compact({
      rxcui: drug.rxcui,
      name: drug.name,
      term_type: drug.tty,
      corrected_from: drug.corrected_from,
      ndc: drug.ndc,
      ingredients: info.ingredients,
      brands: info.brands.length > 15 ? [...info.brands.slice(0, 15), `and ${info.brands.length - 15} more`] : info.brands,
      classes: info.classes,
      labels_total: total,
      }),
      // Kept even when empty: "no manufacturer label" is an answer.
      labels: ranked.slice(0, 5),
    };
  },
});
