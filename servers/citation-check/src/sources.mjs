// src/sources.mjs
//
// The bibliographic sources, each normalised to one record shape:
//   { doi, title, subtitle, authors: [{family, given, org?}], year, years, venue, volume, issue,
//     pages, publisher, kind, arxiv, pmid, url, updates: [{type, doi, date}], preprintOf, source }
// Crossref is primary (it carries Retraction Watch data as updated-by); DataCite resolves arXiv and
// other DataCite DOIs; PubMed resolves PMIDs; OpenAlex is the search fallback for works Crossref
// does not index (conference papers, arXiv-only preprints); doi.org says whether a DOI exists at
// all when neither Crossref nor DataCite knows it.
import { stripMarkup, splitDisplayName } from "./text.mjs";

export const HOSTS = ["api.crossref.org", "api.datacite.org", "eutils.ncbi.nlm.nih.gov", "api.openalex.org", "doi.org"];

/**
 * Published limits. Crossref (from 2025-12-01): public pool 5/s for single records and 1/s for
 * lists, one request at a time; the polite pool (a mailto the user sets in CROSSREF_MAILTO) allows
 * 10/s and 3/s, three at a time. NCBI E-utilities: 3/s without a key. OpenAlex: credits per day;
 * kept to 5/s. DataCite and doi.org: kept to 10/s.
 */
export function limits({ polite = false } = {}) {
  return [
    { host: "api.crossref.org", path: /^\/works\/10\./, group: "crossref", perSecond: polite ? 10 : 5, concurrency: polite ? 3 : 1 },
    { host: "api.crossref.org", group: "crossref", perSecond: polite ? 3 : 1, concurrency: polite ? 3 : 1 },
    { host: "eutils.ncbi.nlm.nih.gov", perSecond: 3, concurrency: 3 },
    { host: "api.openalex.org", perSecond: 5, concurrency: 3 },
    { host: "api.datacite.org", perSecond: 10, concurrency: 4 },
    { host: "doi.org", perSecond: 10, concurrency: 4 },
  ];
}

const enc = encodeURIComponent;
const first = (a) => (Array.isArray(a) ? a[0] : a) ?? undefined;
const yearOf = (d) => d?.["date-parts"]?.[0]?.[0] ?? undefined;
const uniq = (xs) => [...new Set(xs.filter((x) => Number.isInteger(x)))];

const CROSSREF_KIND = {
  "journal-article": "article",
  "proceedings-article": "inproceedings",
  "book-chapter": "incollection",
  "book-section": "incollection",
  "reference-entry": "incollection",
  book: "book",
  monograph: "book",
  "edited-book": "book",
  "reference-book": "book",
  "posted-content": "preprint",
  dissertation: "thesis",
  report: "report",
  dataset: "dataset",
};

// Crossref's update types (from Retraction Watch and publishers) folded into our flags.
const UPDATE_FLAG = {
  retraction: "retracted",
  withdrawal: "retracted",
  removal: "retracted",
  partial_retraction: "partially_retracted",
  expression_of_concern: "expression_of_concern",
  correction: "corrected",
  corrigendum: "corrected",
  erratum: "corrected",
};
export const flagForUpdate = (type) => UPDATE_FLAG[String(type).toLowerCase().replace(/-/g, "_")];

export function fromCrossref(w) {
  const authors = (w.author ?? []).map((a) => (a.family ? { family: a.family, given: a.given ?? "" } : { family: a.name ?? "", given: "", org: true })).filter((a) => a.family);
  return {
    doi: w.DOI?.toLowerCase(),
    title: stripMarkup(first(w.title) ?? ""),
    subtitle: stripMarkup(first(w.subtitle) ?? "") || undefined,
    authors,
    year: yearOf(w.issued) ?? yearOf(w["published-print"]) ?? yearOf(w["published-online"]),
    years: uniq([yearOf(w.issued), yearOf(w["published-print"]), yearOf(w["published-online"]), yearOf(w.created)]),
    venue: stripMarkup(first(w["container-title"]) ?? "") || undefined,
    volume: w.volume,
    issue: w.issue,
    pages: w.page,
    publisher: w.publisher,
    kind: CROSSREF_KIND[w.type] ?? "misc",
    url: w.DOI ? `https://doi.org/${w.DOI}` : w.URL,
    // Crossref can list one notice twice (from the publisher and from Retraction Watch): keep one.
    updates: [...new Map((w["updated-by"] ?? []).map((u) => [`${u.type}|${u.DOI?.toLowerCase()}`, { type: String(u.type), doi: u.DOI?.toLowerCase(), date: u.updated?.["date-time"]?.slice(0, 10) }])).values()],
    preprintOf: w.relation?.["is-preprint-of"]?.[0]?.id?.toLowerCase(),
    source: "crossref",
  };
}

const CROSSREF_SELECT = "DOI,title,subtitle,author,issued,published-print,published-online,created,container-title,volume,issue,page,publisher,type,updated-by,relation,URL";

/** Crossref records for up to 40 DOIs in one list request; DOIs Crossref does not know are absent. */
export async function crossrefByDois(ctx, dois) {
  const out = new Map();
  for (let i = 0; i < dois.length; i += 40) {
    const batch = dois.slice(i, i + 40);
    const filter = batch.map((d) => `doi:${d}`).join(",");
    const { data } = await ctx.fetcher.getJson(`https://api.crossref.org/works?filter=${enc(filter)}&rows=${batch.length}&select=${CROSSREF_SELECT}${ctx.mailto}`);
    for (const item of data?.message?.items ?? []) out.set(item.DOI.toLowerCase(), fromCrossref(item));
  }
  return out;
}

export async function crossrefWork(ctx, doi) {
  const { status, data } = await ctx.fetcher.getJson(`https://api.crossref.org/works/${enc(doi)}${ctx.mailto ? `?${ctx.mailto.slice(1)}` : ""}`, { allowStatus: [404] });
  return status === 404 ? null : fromCrossref(data.message);
}

/** Candidates for a free-text citation, Crossref's own relevance order. */
export async function crossrefSearch(ctx, query, rows = 5) {
  const q = query.slice(0, 400);
  const { data } = await ctx.fetcher.getJson(`https://api.crossref.org/works?query.bibliographic=${enc(q)}&rows=${rows}&select=${CROSSREF_SELECT}${ctx.mailto}`);
  return (data?.message?.items ?? []).map(fromCrossref);
}

export function fromDatacite(d) {
  const a = d.attributes;
  const arxiv = a.doi?.toLowerCase().startsWith("10.48550/arxiv.") ? a.doi.slice("10.48550/arxiv.".length) : undefined;
  const authors = (a.creators ?? [])
    .map((c) => (c.familyName ? { family: c.familyName, given: c.givenName ?? "" } : c.nameType === "Organizational" ? { family: c.name, given: "", org: true } : c.name?.includes(",") ? { family: c.name.split(",")[0].trim(), given: c.name.split(",").slice(1).join(",").trim() } : splitDisplayName(c.name)))
    .filter((x) => x.family);
  const published = (a.relatedIdentifiers ?? []).find((r) => r.relationType === "IsPreviousVersionOf" && r.relatedIdentifierType === "DOI");
  return {
    doi: a.doi?.toLowerCase(),
    title: stripMarkup(a.titles?.[0]?.title ?? ""),
    authors,
    year: a.publicationYear ? Number(a.publicationYear) : undefined,
    years: uniq([Number(a.publicationYear)]),
    venue: arxiv ? "arXiv" : a.container?.title || undefined,
    publisher: typeof a.publisher === "string" ? a.publisher : a.publisher?.name,
    kind: arxiv ? "preprint" : a.types?.resourceTypeGeneral === "Dataset" ? "dataset" : a.types?.resourceTypeGeneral === "Software" ? "software" : "misc",
    arxiv,
    url: `https://doi.org/${a.doi}`,
    updates: [],
    preprintOf: published?.relatedIdentifier?.toLowerCase(),
    source: "datacite",
  };
}

export async function dataciteWork(ctx, doi) {
  const { status, data } = await ctx.fetcher.getJson(`https://api.datacite.org/dois/${enc(doi)}`, { allowStatus: [404] });
  return status === 404 ? null : fromDatacite(data.data);
}

export async function pubmedRecords(ctx, pmids) {
  const out = new Map();
  if (!pmids.length) return out;
  const { data } = await ctx.fetcher.getJson(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&retmode=json&id=${pmids.map(enc).join(",")}`);
  for (const id of pmids) {
    const r = data?.result?.[id];
    if (!r || r.error) continue;
    const doi = (r.articleids ?? []).find((x) => x.idtype === "doi")?.value?.toLowerCase();
    out.set(id, {
      doi,
      title: stripMarkup(r.title ?? "").replace(/\.$/, ""),
      authors: (r.authors ?? []).filter((x) => x.authtype === "Author").map((x) => ({ family: x.name.replace(/\s+[A-Z]{1,3}$/, ""), given: x.name.match(/\s([A-Z]{1,3})$/)?.[1] ?? "" })),
      year: Number(String(r.pubdate).slice(0, 4)) || undefined,
      years: uniq([Number(String(r.pubdate).slice(0, 4)), Number(String(r.epubdate ?? "").slice(0, 4))]),
      venue: r.fulljournalname || r.source,
      volume: r.volume || undefined,
      issue: r.issue || undefined,
      pages: r.pages || undefined,
      kind: "article",
      pmid: id,
      url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
      updates: [],
      source: "pubmed",
    });
  }
  return out;
}

const OPENALEX_KIND = { article: "article", "book-chapter": "incollection", book: "book", preprint: "preprint", dissertation: "thesis", dataset: "dataset", report: "report" };

export function fromOpenalex(w) {
  const src = w.primary_location?.source;
  const doi = w.doi ? w.doi.replace(/^https:\/\/doi\.org\//i, "").toLowerCase() : undefined;
  const b = w.biblio ?? {};
  return {
    doi,
    title: stripMarkup(w.display_name ?? w.title ?? ""),
    authors: (w.authorships ?? []).map((a) => splitDisplayName(a.author?.display_name ?? a.raw_author_name ?? "")).filter((a) => a.family),
    year: w.publication_year ?? undefined,
    years: uniq([w.publication_year]),
    venue: src?.display_name || undefined,
    volume: b.volume || undefined,
    issue: b.issue || undefined,
    pages: b.first_page ? (b.last_page && b.last_page !== b.first_page ? `${b.first_page}-${b.last_page}` : b.first_page) : undefined,
    kind: w.type_crossref === "proceedings-article" ? "inproceedings" : (OPENALEX_KIND[w.type] ?? "misc"),
    url: doi ? `https://doi.org/${doi}` : w.id,
    updates: w.is_retracted ? [{ type: "retraction" }] : [],
    source: "openalex",
  };
}

const OPENALEX_SELECT = "id,doi,display_name,authorships,publication_year,primary_location,biblio,type,type_crossref,is_retracted";

/** OpenAlex search; null when OpenAlex refuses (daily credits spent or rate limited). */
export async function openalexSearch(ctx, query, rows = 5, { byTitle = false } = {}) {
  const key = ctx.openalexKey ? `&api_key=${enc(ctx.openalexKey)}` : "";
  const q = query.replace(/[,|:]/g, " ").slice(0, 300);
  const find = byTitle ? `filter=${enc(`title.search:${q}`)}` : `search=${enc(q)}`;
  const res = await ctx.fetcher.request(`https://api.openalex.org/works?${find}&per_page=${rows}&select=${OPENALEX_SELECT}${key}`);
  if (res.status === 429 || res.status === 402 || res.status === 403) return null;
  if (!res.ok) return null;
  try {
    return (JSON.parse(res.text).results ?? []).map(fromOpenalex);
  } catch {
    return null;
  }
}

/** Whether any registration agency knows the DOI (doi.org handle API: responseCode 1 exists, 100 does not). */
export async function doiRegistered(ctx, doi) {
  const { status, data } = await ctx.fetcher.getJson(`https://doi.org/api/handles/${enc(doi)}`, { allowStatus: [404] });
  if (status === 404) return false;
  return data?.responseCode === 1;
}

/** DataCite search by title, narrowed by first author when known (finds arXiv originals). */
export async function dataciteSearch(ctx, title, family, rows = 5) {
  const clean = (s) => s.replace(/["\\:()[\]{}^~*?!+\-&|/]/g, " ").replace(/\s+/g, " ").trim();
  const q = `titles.title:"${clean(title).slice(0, 200)}"${family ? ` AND creators.familyName:"${clean(family)}"` : ""}`;
  const { data } = await ctx.fetcher.getJson(`https://api.datacite.org/dois?query=${encodeURIComponent(q)}&page%5Bsize%5D=${rows}`);
  return (data?.data ?? []).map(fromDatacite);
}
