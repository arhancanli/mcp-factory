import { z } from "zod";
import { compact, defineTool, ToolError } from "../kit/index.mjs";
import { toBibtex } from "../bibtex.mjs";
import { summarizeRecord, updateFlags } from "../check.mjs";
import { arxivDoi, cleanDoi, findArxiv, findDoi, findPmid } from "../ids.mjs";
import { compare, fromText, rank, TITLE_MATCH } from "../match.mjs";
import { crossrefSearch, crossrefWork, dataciteWork, doiRegistered, openalexSearch, pubmedRecords } from "../sources.mjs";

const MAX_AUTHORS = 20;

async function byIdentifier(ctx, id) {
  const doi = cleanDoi(id) ?? findDoi(id);
  const arxiv = findArxiv(id) ?? (/^\d{4}\.\d{4,5}(v\d+)?$/.test(id.trim()) ? id.trim().replace(/v\d+$/, "") : null);
  const pmid = findPmid(id) ?? (/^\d{5,9}$/.test(id.trim()) ? id.trim() : null);
  if (doi) {
    const r = (await crossrefWork(ctx, doi)) ?? (await dataciteWork(ctx, doi));
    if (r) return r;
    if (await doiRegistered(ctx, doi)) throw new ToolError("no_metadata", `The DOI ${doi} is registered, but neither Crossref nor DataCite returns metadata for it.`);
    throw new ToolError("doi_not_registered", `No registration agency knows the DOI ${doi}. It is likely mistyped or invented.`);
  }
  if (arxiv) {
    const r = await dataciteWork(ctx, arxivDoi(arxiv));
    if (r) return r;
    throw new ToolError("not_found", `arXiv has no paper ${arxiv}.`);
  }
  if (pmid) {
    const r = (await pubmedRecords(ctx, [pmid])).get(pmid);
    if (!r) throw new ToolError("not_found", `PubMed has no record ${pmid}.`);
    return r.doi ? ((await crossrefWork(ctx, r.doi)) ?? r) : r;
  }
  return null;
}

export const lookupWork = defineTool({
  name: "lookup_work",
  title: "Look up one work",
  description: "Returns the record for a DOI, arXiv id, PMID, link, title or full citation: authors, year, venue, pages, DOI, retraction and correction notices, a newer published version if one exists, and BibTeX.",
  input: { id: z.string().min(3).max(1000).describe("DOI, arXiv id, PMID, URL, title or citation") },
  output: {
    doi: z.string().optional(),
    title: z.string(),
    flags: z.array(z.string()).optional(),
    bibtex: z.string(),
  },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  handler: async ({ id }, ctx) => {
    let r = await byIdentifier(ctx, id);
    if (!r) {
      const c = fromText(id);
      const pool = [...(await crossrefSearch(ctx, id)), ...((await openalexSearch(ctx, id)) ?? [])];
      const best = pool.map((x, i) => ({ x, ...rank(c, x, i) })).sort((a, b) => b.score - a.score)[0];
      if (!best || compare(c, best.x).title < TITLE_MATCH) {
        throw new ToolError("not_found", `No work matches "${id.slice(0, 120)}" in Crossref or OpenAlex.${best ? ` Closest: "${best.x.title}" (${best.x.doi ?? best.x.url}).` : ""}`);
      }
      r = best.x;
    }
    const flags = updateFlags(r);
    if (r.preprintOf) flags.push("published_version_exists");
    return compact({
      ...summarizeRecord(r),
      authors: (r.authors ?? []).slice(0, MAX_AUTHORS).map((a) => (a.given ? `${a.given} ${a.family}` : a.family)).join(", ") + ((r.authors?.length ?? 0) > MAX_AUTHORS ? ` and ${r.authors.length - MAX_AUTHORS} more` : ""),
      volume: r.volume,
      issue: r.issue,
      pages: r.pages,
      publisher: r.publisher,
      type: r.kind,
      arxiv: r.arxiv,
      pmid: r.pmid,
      flags,
      notices: (r.updates ?? []).filter((u) => u.doi || u.date).map((u) => compact({ type: u.type, notice_doi: u.doi, date: u.date })),
      published_version: r.preprintOf ? `https://doi.org/${r.preprintOf}` : undefined,
      bibtex: toBibtex(r),
    });
  },
});
