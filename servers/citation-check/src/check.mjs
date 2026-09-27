// src/check.mjs
//
// Checks a list of citations. Identifiers first, in batches (a DOI lookup costs a fifth of a
// search): arXiv ids through DataCite, PMIDs through PubMed, DOIs through Crossref in lists of 40,
// then DataCite, then doi.org for DOIs neither knows. Citations without an identifier, or whose
// identifier points at a different work, are searched in Crossref and then OpenAlex, and the best
// candidate is chosen by our own comparison, never by the source's ranking alone.
import { compact, mapLimit } from "./kit/index.mjs";
import { parseBibtex, toBibtex } from "./bibtex.mjs";
import { arxivDoi } from "./ids.mjs";
import { CLOSEST_SHOWN, compare, diffs, DIFFERENT_WORK, fromBibtex, fromText, isRetractionNotice, rank, TITLE_MATCH } from "./match.mjs";
import { arxivOriginal, crossrefByDois, crossrefSearch, dataciteSearch, dataciteWork, doiRegistered, flagForUpdate, openalexSearch, pubmedRecords } from "./sources.mjs";
import { clipText } from "./text.mjs";

export const MAX_REFERENCES = 30;

/** Splits pasted text into citations: BibTeX entries, numbered references, paragraphs or lines. */
export function splitReferences(text) {
  const t = String(text ?? "").replace(/\r\n?/g, "\n");
  if (/@\s*[A-Za-z]+\s*[{(]/.test(t)) {
    const entries = parseBibtex(t);
    if (entries.length) return entries.map(fromBibtex);
  }
  const lines = t.split("\n").map((l) => l.trim());
  const marker = /^(?:\[\d{1,4}\]|\(\d{1,4}\)|\d{1,4}[.)])\s+/;
  const refs = [];
  if (lines.filter((l) => marker.test(l)).length >= 2) {
    for (const l of lines) {
      if (!l) continue;
      if (marker.test(l) || !refs.length) refs.push(l);
      else refs[refs.length - 1] += ` ${l}`;
    }
  } else if (/\n\s*\n/.test(t)) {
    refs.push(...t.split(/\n\s*\n/).map((p) => p.replace(/\s*\n\s*/g, " ").trim()));
  } else refs.push(...lines);
  return refs.filter((r) => r.length >= 8).map(fromText);
}

const authorLine = (r) => {
  const names = (r.authors ?? []).map((a) => a.family);
  return names.length > 3 ? `${names.slice(0, 3).join(", ")} et al.` : names.join(", ");
};

export function summarizeRecord(r) {
  return compact({ doi: r.doi, title: r.title, authors: authorLine(r), year: r.year, venue: r.venue, url: r.url, source: r.source });
}

export function updateFlags(r) {
  const flags = new Set();
  for (const u of r.updates ?? []) {
    const f = flagForUpdate(u.type);
    if (f) flags.add(f);
  }
  if (/^\s*retracted\b/i.test(r.title ?? "")) flags.add("retracted");
  if (isRetractionNotice(r)) flags.add("cites_retraction_notice");
  return [...flags];
}

const notices = (r) => (r.updates ?? []).filter((u) => flagForUpdate(u.type)).map((u) => compact({ type: u.type, notice_doi: u.doi, date: u.date }));

async function search(ctx, c, state) {
  const query = c.title ? [c.firstFamily, c.title, c.years[0], c.venue].filter(Boolean).join(" ") : c.raw;
  const fits = (b) => b && b.s.title >= TITLE_MATCH && b.s.author !== false && b.s.year !== false;
  let best = pick(c, await crossrefSearch(ctx, query));
  const searched = ["crossref"];
  // Stop at Crossref only when its best candidate fits fully; a title match with the wrong year or
  // author may be a repost, and the cited original may be elsewhere (arXiv in DataCite, conference
  // papers in OpenAlex). The fallbacks search by title: the citation's own, or the title Crossref
  // matched, or a guess from the citation's layout.
  if (fits(best)) return { ...best, searched };
  const title = c.title ?? (best && best.s.title >= TITLE_MATCH ? best.r.title : c.guessTitle);
  if (title) {
    searched.push("datacite");
    const dc = pick(c, await dataciteSearch(ctx, title, c.firstFamily));
    if (dc && (!best || dc.score > best.score)) best = dc;
    if (fits(best)) return { ...best, searched };
  }
  const oa = await openalexSearch(ctx, title ?? c.raw, 5, { byTitle: Boolean(title) });
  if (oa === null) state.openalexUnavailable = true;
  else searched.push("openalex");
  // A record dated by a later copy gives way to its arXiv original when OpenAlex lists one.
  const alt = pick(c, await Promise.all((oa ?? []).map(async (r) => (r.citedSince ? ((await arxivOriginal(ctx, r)) ?? r) : r))));
  if (alt && (!best || alt.score > best.score)) best = alt;
  return { ...(best ?? {}), searched };
}

/**
 * The best candidate for a citation. A reply, comment, correction or retraction notice repeats the
 * title of the work it is about, so it is never taken as the cited work unless the citation itself
 * cites such a notice.
 */
export function pick(c, candidates) {
  let best = null;
  candidates.forEach((r, i) => {
    if (!r.title) return;
    const { s, score, derivative } = rank(c, r, i);
    if (derivative) return;
    if (!best || score > best.score) best = { r, s, score };
  });
  return best;
}

function verdictFor(c, r, s) {
  if (s.title >= TITLE_MATCH && s.author !== false && s.year !== false) return "verified";
  return "mismatch";
}

async function resolveIdentifiers(ctx, cites) {
  const byPmid = await pubmedRecords(ctx, [...new Set(cites.filter((c) => c.pmid && !c.doi).map((c) => c.pmid))]);
  for (const c of cites) if (!c.doi && c.pmid && byPmid.get(c.pmid)?.doi) c.resolvedDoi = byPmid.get(c.pmid).doi;
  const dois = [...new Set(cites.map((c) => c.doi ?? c.resolvedDoi).filter(Boolean))];
  const crossref = await crossrefByDois(ctx, dois);
  const records = new Map(crossref);
  const missing = [...dois.filter((d) => !records.has(d)), ...cites.filter((c) => c.arxiv && !c.doi).map((c) => arxivDoi(c.arxiv))];
  await Promise.all(
    [...new Set(missing)].map(async (d) => {
      const r = await dataciteWork(ctx, d);
      if (r) records.set(d, r);
      else records.set(d, (await doiRegistered(ctx, d)) ? "registered" : "unregistered");
    }),
  );
  return { records, byPmid };
}

export async function checkCitations(ctx, cites, { bibtex = false } = {}) {
  const state = { openalexUnavailable: false };
  const { records, byPmid } = await resolveIdentifiers(ctx, cites);
  const rows = await mapLimit(cites, 4, async (c, i) => {
    const id = c.doi ?? c.resolvedDoi ?? (c.arxiv ? arxivDoi(c.arxiv) : undefined);
    let rec = id ? records.get(id) : undefined;
    if (rec === undefined && c.pmid && byPmid.has(c.pmid)) rec = byPmid.get(c.pmid);
    const row = { n: i + 1, cited: clipText(c.raw, 160), ...(c.key ? { key: c.key } : {}) };
    const flags = [];
    let matched = null;
    let s = null;
    let verdict;
    let searched = [];
    let suggested = null;

    if (rec === "unregistered") flags.push("doi_not_registered");
    if (rec === "registered") {
      verdict = "unverifiable";
      row.note = `The DOI ${id} is registered, but no source returns metadata to compare the citation with.`;
    } else if (rec && typeof rec === "object") {
      const sId = compare(c, rec);
      if (sId.title < DIFFERENT_WORK) {
        // The identifier resolves to a different work: say where it points, and look for the work
        // the citation actually describes.
        flags.push("identifier_points_to_different_work");
        row.identifier_resolves_to = summarizeRecord(rec);
        const found = await search(ctx, c, state);
        searched = found.searched ?? [];
        if (found.r && found.s.title >= TITLE_MATCH) {
          suggested = found.r;
          s = found.s;
        }
        verdict = "mismatch";
      } else {
        matched = rec;
        s = sId;
        verdict = verdictFor(c, rec, s);
      }
    }

    if (!verdict) {
      const found = await search(ctx, c, state);
      searched = found.searched ?? [];
      if (found.r && found.s.title >= TITLE_MATCH) {
        matched = found.r;
        s = found.s;
        verdict = verdictFor(c, found.r, found.s);
        if (!c.doi && found.r.doi) flags.push("doi_added");
      } else {
        verdict = "not_found";
        if (found.r && found.s.title >= CLOSEST_SHOWN) row.closest = { ...summarizeRecord(found.r), similarity: Number(found.s.title.toFixed(2)) };
        row.note = `No work matching this citation in ${searched.join(" or ")}${state.openalexUnavailable ? " (OpenAlex was unavailable)" : ""}. It may be fabricated, or not indexed (books, theses, very new or non-English works).`;
      }
    }

    row.verdict = verdict;
    const target = suggested ?? matched;
    if (target) {
      flags.push(...updateFlags(target));
      if (target.citedSince) flags.push("doi_may_be_later_copy");
      if (target.preprintOf) flags.push("published_version_exists");
    }
    if (flags.length) row.flags = [...new Set(flags)];
    if (matched) row.matched = summarizeRecord(matched);
    if (suggested) row.suggested = summarizeRecord(suggested);
    if (target && s) {
      const d = diffs(c, target, s);
      if (d.length) row.diffs = d;
    }
    if (target && notices(target).length) row.notices = notices(target);
    if (target?.preprintOf) row.published_version = `https://doi.org/${target.preprintOf}`;
    if (bibtex && target && verdict !== "not_found") row.bibtex = toBibtex(target, c.key);
    return row;
  });
  const counts = { verified: 0, mismatch: 0, not_found: 0, unverifiable: 0 };
  for (const r of rows) counts[r.verdict]++;
  const retracted = rows.filter((r) => r.flags?.includes("retracted") || r.flags?.includes("partially_retracted")).length;
  return { counts: { ...counts, retracted }, results: rows };
}
