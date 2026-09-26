import { z } from "zod";
import { clip, compact, defineTool, mapLimit } from "../kit/index.mjs";
import { idNumbers, replacements } from "../data.mjs";
import { draftBase, infoUrl, rfcNumber, rfcUrl, seriesId } from "../rfcindex.mjs";

const STATUS = { "INTERNET STANDARD": "Internet Standard", "DRAFT STANDARD": "Draft Standard", "PROPOSED STANDARD": "Proposed Standard", "BEST CURRENT PRACTICE": "Best Current Practice", INFORMATIONAL: "Informational", EXPERIMENTAL: "Experimental", HISTORIC: "Historic", UNKNOWN: "Unknown" };
const rfcs = (ns) => (ns.length ? ns.map((n) => `RFC ${n}`) : undefined);

async function resolve(store, raw) {
  const n = rfcNumber(raw);
  if (n !== undefined) return { numbers: [n] };
  const series = seriesId(raw);
  if (series) {
    const idx = await store.index();
    return idx.series.has(series) ? { numbers: idx.series.get(series), series } : { error: "not_found", note: `${series} is not in the RFC index.` };
  }
  const draft = draftBase(raw);
  if (draft) {
    const idx = await store.index();
    return idx.drafts.has(draft) ? { numbers: [idx.drafts.get(draft)], draft } : { error: "not_published", note: `${draft} has not been published as an RFC.` };
  }
  return { error: "not_an_id", note: "Give an RFC number (RFC 9110), a series id (BCP 14, STD 97) or a draft name." };
}

async function describe(store, n, { abstract }) {
  const m = await store.meta(n);
  if (!m) return { rfc: `RFC ${n}`, error: "not_found", note: `RFC ${n} does not exist or was never issued.` };
  const obsoletedBy = idNumbers(m.obsoleted_by);
  const current = obsoletedBy.length === 0;
  const authors = m.authors ?? [];
  return compact({
    rfc: `RFC ${n}`,
    title: m.title,
    status: STATUS[m.status] ?? m.status,
    current,
    obsoleted_by: rfcs(obsoletedBy),
    current_replacements: current ? undefined : rfcs(await replacements(store, { n, obsoletedBy })),
    updated_by: rfcs(idNumbers(m.updated_by)),
    obsoletes: rfcs(idNumbers(m.obsoletes)),
    updates: rfcs(idNumbers(m.updates)),
    also: m.see_also?.length ? m.see_also : undefined,
    published: m.pub_date,
    authors: authors.length > 5 ? `${authors.slice(0, 5).join(", ")} et al.` : authors.join(", "),
    abstract: abstract && m.abstract ? clip(m.abstract.replace(/\s+/g, " ").trim(), 500) : undefined,
    url: rfcUrl(n),
    errata: m.errata_url,
    info: infoUrl(n),
  });
}

export const rfcInfo = defineTool({
  name: "rfc_info",
  title: "RFC status and replacements",
  description: "For up to 20 RFCs (RFC 2616, BCP 14, STD 97 or a draft name): title, status, whether it is current, what obsoletes it and the current replacements at the end of that chain, what updates it, and links. Use before citing or implementing an RFC.",
  input: { ids: z.array(z.string().min(1).max(100)).min(1).max(20) },
  output: { results: z.array(z.looseObject({ id: z.string(), rfc: z.string().optional(), current: z.boolean().optional() })) },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  handler: async ({ ids }, { store }) => {
    const results = await mapLimit(ids, 6, async (id) => {
      const r = await resolve(store, id);
      if (r.error) return { id, error: r.error, note: r.note };
      const rows = await mapLimit(r.numbers, 6, (n) => describe(store, n, { abstract: ids.length <= 3 }));
      const tag = compact({ series: r.series, draft: r.draft });
      return rows.map((row) => ({ id, ...tag, ...row }));
    });
    return { results: results.flat() };
  },
});
