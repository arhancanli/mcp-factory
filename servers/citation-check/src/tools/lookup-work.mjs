import { z } from "zod";
import { compact, defineTool, ToolError } from "../kit/index.mjs";
import { toBibtex } from "../bibtex.mjs";
import { pick, summarizeRecord, updateFlags } from "../check.mjs";
import { arxivDoi, cleanDoi, findArxiv, findDoi, findPmid } from "../ids.mjs";
import { discussedTitle, familyIn, stripNoticePrefix } from "../text.mjs";
import { fromText, TITLE_MATCH } from "../match.mjs";
import { arxivOriginal, crossrefSearch, crossrefWork, dataciteSearch, dataciteWork, doiRegistered, openalexSearch, pubmedRecords } from "../sources.mjs";

const MAX_AUTHORS = 20;

const SEARCH_WORDS = /\b(?:retraction|retracted|retract|notice|notices|correction|corrigendum|erratum|expression of concern|comment|reply|doi|paper|article|study|published|citation|reference|the|of)\b/gi;

/** The query without words that describe the search rather than the work, and without years. */
export const stripSearchWords = (q) => q.replace(SEARCH_WORDS, " ").replace(/\b(19|20)\d{2}\b/g, " ").replace(/\s+/g, " ").trim();

/** OpenAlex records dated by a later copy, replaced by their arXiv original where there is one. */
const originals = (ctx, pool) => Promise.all(pool.map(async (r) => (r.citedSince ? ((await arxivOriginal(ctx, r)) ?? r) : r)));

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
    let mismatch;
    if (!r) {
      // Search as typed; if nothing matches strongly, search again without the words agents add
      // about the search itself ("... Science 2011 retraction notice"), which push the paper out of
      // the candidates. Replies, comments and notices are never taken as the work itself (pick).
      // A match "fits" when the title matches and neither the first author nor the year contradicts
      // the query: a same-titled letter (the Wakefield paper has one) matches the title but not the
      // author, and must not end the search.
      const fits = (b) => b && b.s.title >= TITLE_MATCH && b.s.author !== false && b.s.year !== false;
      const better = (a, b) => (!b || (fits(a) && !fits(b)) || (fits(a) === fits(b) && a.score > b.score) ? a : b);
      let best = null;
      let discussed;
      // Search words are dropped from the query, but its years still decide whether a match fits.
      const years = fromText(id).years;
      for (const q of [id, stripSearchWords(id)].filter((x, i, a) => x && a.indexOf(x) === i)) {
        const c = { ...fromText(q), years };
        const [cr, oa] = await Promise.all([crossrefSearch(ctx, q, 10), openalexSearch(ctx, q)]);
        const pool = await originals(ctx, [...cr, ...(oa ?? [])]);
        discussed ??= pool.map((x) => discussedTitle(x.title)).find(Boolean);
        const found = pick(c, pool);
        if (found) best = better(found, best);
        if (fits(best)) break;
      }
      // Still no fit: the title is known (from a near match, or from comments that name the work),
      // so search that exact title, most cited first; an original outranks its comments and letters.
      const title = discussed ?? (best && best.s.title >= TITLE_MATCH ? stripNoticePrefix(best.r.title) : undefined);
      if (!fits(best) && title) {
        const c = { ...fromText(stripSearchWords(id)), years };
        // The first author for DataCite (where arXiv originals are): from the query, or the near
        // match's first author when the query names them.
        const hint = c.firstFamily ?? (best?.r.authors?.[0]?.family && familyIn(best.r.authors[0].family, c.tokens) ? best.r.authors[0].family : undefined);
        // Without OpenAlex (its free daily allowance is shared per IP), a deeper Crossref search for
        // the exact title reaches an original that its comments outrank (the arsenic paper is 15th).
        const [byTitle, dc] = await Promise.all([openalexSearch(ctx, title, 10, { byTitle: true, mostCited: true }).then((oa) => oa ?? crossrefSearch(ctx, title, 20)), dataciteSearch(ctx, title, hint)]);
        const pool = await originals(ctx, [...byTitle, ...dc]);
        const found = pick(c, pool);
        if (found) best = better(found, best);
      }
      mismatch = best && best.s.title >= TITLE_MATCH && !fits(best) ? best : undefined;
      if (best?.r && best.s.title >= TITLE_MATCH && best.r.source === "openalex" && best.r.doi) {
        // Crossref holds the retraction and correction notices; prefer its record for the same DOI.
        const { citedSince } = best.r;
        best.r = { ...((await crossrefWork(ctx, best.r.doi)) ?? best.r), citedSince };
      }
      if (!best || best.s.title < TITLE_MATCH) {
        throw new ToolError("not_found", `No work matches "${id.slice(0, 120)}" in Crossref or OpenAlex.${best ? ` Closest: "${best.r.title}" (${best.r.doi ?? best.r.url}).` : ""}`);
      }
      r = best.r;
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
      note: r.citedSince
        ? `This work is cited from ${r.citedSince} on, years before this record's date: the DOI is probably a later copy (a repost or reprint) of an older work without a DOI, such as a conference paper. Cite the original.`
        : mismatch
          ? `Closest record; its ${mismatch.s.year === false ? "year" : "first author"} differs from the query. Check it is the work meant.`
          : undefined,
    });
  },
});
