import { z } from "zod";
import { clip, compact, defineTool } from "../kit/index.mjs";
import { describeDrug, recalls, resolveDrug, shortages } from "../drugs.mjs";
import { READ_ONLY } from "./common.mjs";

const day = (v) => (/^\d{8}$/.test(v ?? "") ? `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}` : v);

export const recallsShortages = defineTool({
  name: "recalls_shortages",
  title: "Drug recalls and shortages",
  description: "FDA drug recalls (class, reason, status, date, product) and shortage records (status, company, reason) for a drug, newest first, from openFDA.",
  input: { drug: z.string().min(2).max(200).describe("Drug name or NDC") },
  output: { drug: z.string(), recalls_total: z.number(), shortages_total: z.number() },
  annotations: READ_ONLY,
  handler: async ({ drug }, ctx) => {
    // Both openFDA searches start on the typed name while RxNorm resolves it; they are repeated only
    // when RxNorm's names differ (a brand, a correction, an NDC).
    const typed = [drug.trim()];
    const early = Promise.all([recalls(ctx, typed), shortages(ctx, typed)]).catch(() => null);
    const d = await resolveDrug(ctx, drug);
    const info = await describeDrug(ctx, d, { classes: false });
    // Plain ingredient names (not "glipizide / metformin" combinations) plus the brand when one was asked for.
    const plain = info.ingredients.filter((n) => !n.includes("/"));
    const names = [...new Set([...(d.tty === "BN" ? [d.name] : []), ...(plain.length ? plain : [d.name])])].slice(0, 5);
    const same = names.length === 1 && names[0].toLowerCase() === typed[0].toLowerCase();
    const first = await early;
    const [r, s] = same && first ? first : await Promise.all([recalls(ctx, names), shortages(ctx, names)]);
    return compact({
      drug: d.name,
      searched: names,
      recalls_total: r.total,
      recalls: r.results.map((x) => compact({ recall_number: x.recall_number, class: x.classification, status: x.status, date: day(x.report_date), firm: x.recalling_firm, reason: clip(x.reason_for_recall ?? "", 300), product: clip(x.product_description ?? "", 240) })),
      shortages_total: s.total,
      shortages: s.results.map((x) => compact({ status: x.status, presentation: x.presentation, company: x.company_name, reason: x.related_info, updated: x.update_date, category: x.therapeutic_category })),
    });
  },
});
