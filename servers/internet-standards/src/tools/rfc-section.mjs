import { z } from "zod";
import { clip, compact, defineTool, ToolError } from "../kit/index.mjs";
import { countErrata, errataMatches, errataUrl } from "../errata.mjs";
import { idNumbers } from "../data.mjs";
import { rfcNumber, rfcUrl } from "../rfcindex.mjs";
import { findSection, searchSections, sectionText } from "../rfctext.mjs";

export const MAX_TEXT = 12_000;
const MAX_TOC = 150;
const APPLIES = new Set(["verified", "held"]);

export const rfcSection = defineTool({
  name: "rfc_section",
  title: "Exact RFC section text",
  description: "Returns the exact text of one RFC section (by number like 15.5.5 or by title) with the verified errata that apply to it; with find, lists the sections containing a phrase; with neither, the table of contents. Warns when the RFC is obsolete.",
  input: {
    rfc: z.string().min(1).max(20).describe("RFC number, e.g. 9110"),
    section: z.string().min(1).max(100).optional(),
    find: z.string().min(2).max(200).optional().describe("Phrase to locate"),
    subtree: z.boolean().optional().describe("Include subsections"),
  },
  output: { rfc: z.string(), obsoleted_by: z.array(z.string()).optional() },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  handler: async ({ rfc, section, find, subtree }, { store }) => {
    const n = rfcNumber(rfc);
    if (n === undefined) throw new ToolError("not_an_rfc", `${rfc} is not an RFC number.`);
    const [meta, doc] = await Promise.all([store.meta(n), store.rfcText(n)]);
    if (!meta) throw new ToolError("not_found", `RFC ${n} does not exist or was never issued.`);
    if (!doc) throw new ToolError("no_text", `RFC ${n} has no plain-text version at the RFC Editor.`);
    const obsoletedBy = idNumbers(meta.obsoleted_by).map((x) => `RFC ${x}`);
    const head = compact({ rfc: `RFC ${n}`, title: meta.title, obsoleted_by: obsoletedBy.length ? obsoletedBy : undefined, url: rfcUrl(n) });
    if (obsoletedBy.length) head.warning = `RFC ${n} is obsolete; check ${obsoletedBy.join(", ")} (rfc_info gives the current replacement).`;

    if (!section && !find) {
      // Top two levels only; every section result lists its own subsections, so an agent can
      // walk 15 -> 15.5 -> 15.5.5 without the whole tree in one answer.
      const toc = doc.sections.filter((s) => s.depth <= 2).map((s) => ({ section: s.id, title: s.title }));
      return { ...head, total_sections: doc.sections.length, contents: toc.slice(0, MAX_TOC), ...(toc.length > MAX_TOC ? { truncated: toc.length - MAX_TOC } : {}) };
    }
    if (!section) {
      const hits = searchSections(doc, find);
      return { ...head, find, matches: hits.slice(0, 20), ...(hits.length > 20 ? { truncated: hits.length - 20 } : {}) };
    }
    const { section: s, candidates } = findSection(doc, section);
    if (!s) {
      const near = (candidates ?? []).slice(0, 10).map((c) => `${c.id} ${c.title}`);
      throw new ToolError("section_not_found", `RFC ${n} has no section "${section}".${near.length ? ` Did you mean: ${near.join("; ")}?` : " Call rfc_section without a section for the contents."}`);
    }
    const text = sectionText(doc, s, { subtree });
    const reports = (await store.errata()).get(n) ?? [];
    // Reports filed against the whole document ("GLOBAL") apply to every section.
    const here = reports.filter((r) => errataMatches(r, s.id, { subtree, title: s.title }) || r.sections.includes("GLOBAL"));
    return compact({
      ...head,
      section: s.id,
      section_title: s.title,
      text: clip(text, MAX_TEXT),
      subsections: subtree ? undefined : doc.sections.filter((x) => !x.unnumbered && !s.unnumbered && x.depth === s.depth + 1 && x.id.startsWith(`${s.id}.`)).map((x) => ({ section: x.id, title: x.title })),
      errata: here.filter((r) => APPLIES.has(r.status)).map((r) => compact({ id: r.id, status: r.status, type: r.type, scope: r.sections.includes("GLOBAL") ? "whole document" : undefined, original: clip(r.original, 800), corrected: clip(r.corrected, 800), notes: clip(r.notes, 400), url: errataUrl(r.id) })),
      errata_counts: countErrata(here),
    });
  },
});
