// src/rfcindex.mjs
//
// The RFC Editor's index of every RFC (rfc-index.xml): title, authors, date, status, stream,
// and the obsoletes / obsoleted-by / updates / updated-by relations, plus the BCP, STD and FYI
// sub-series and the numbers that were never issued. One download answers lookups, chain walks
// and searches for the whole series, so no tool needs one request per RFC.
import { child, children, childText, parseXml } from "./xml.mjs";

/** "RFC 2616", "rfc2616", "2616", "RFC-2616" -> 2616; anything else -> undefined. */
export function rfcNumber(raw) {
  const m = String(raw).trim().match(/^(?:rfc[\s-]*)?0*(\d{1,5})$/i);
  return m ? Number(m[1]) : undefined;
}

/** "BCP 14", "bcp14", "STD-97", "FYI 1" -> "BCP14"; anything else -> undefined. */
export function seriesId(raw) {
  const m = String(raw).trim().match(/^(bcp|std|fyi)[\s-]*0*(\d{1,4})$/i);
  return m ? `${m[1].toUpperCase()}${Number(m[2])}` : undefined;
}

/** Internet-Draft name without its revision: "draft-ietf-x-y-19" -> "draft-ietf-x-y". */
export function draftBase(raw) {
  const m = String(raw).trim().toLowerCase().match(/^(draft-[a-z0-9-]+?)(?:-(\d{2}))?(?:\.txt)?$/);
  return m ? m[1] : undefined;
}

const STATUS_NAMES = {
  "INTERNET STANDARD": "Internet Standard",
  "DRAFT STANDARD": "Draft Standard",
  "PROPOSED STANDARD": "Proposed Standard",
  "BEST CURRENT PRACTICE": "Best Current Practice",
  INFORMATIONAL: "Informational",
  EXPERIMENTAL: "Experimental",
  HISTORIC: "Historic",
  UNKNOWN: "Unknown",
};
export const STATUSES = Object.values(STATUS_NAMES);

const ids = (node, name) => children(child(node, name), "doc-id").map((d) => d.text.trim());
const toNumbers = (list) => list.map((id) => rfcNumber(id)).filter((n) => n !== undefined);

function parseEntry(e) {
  const date = child(e, "date");
  const month = childText(date, "month");
  const year = childText(date, "year");
  const day = childText(date, "day");
  const abstract = children(child(e, "abstract"), "p").map((p) => p.text.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n\n");
  const status = childText(e, "current-status");
  const pubStatus = childText(e, "publication-status");
  return {
    n: rfcNumber(childText(e, "doc-id")),
    title: (childText(e, "title") ?? "").replace(/\s+/g, " "),
    authors: children(e, "author").map((a) => childText(a, "name")).filter(Boolean),
    published: [day, month, year].filter(Boolean).join(" "),
    year: year ? Number(year) : undefined,
    formats: children(child(e, "format"), "file-format").map((f) => f.text.trim()),
    pages: Number(childText(e, "page-count")) || undefined,
    keywords: children(child(e, "keywords"), "kw").map((k) => k.text.trim()).filter(Boolean),
    abstract,
    draft: childText(e, "draft"),
    also: ids(e, "is-also"),
    obsoletes: toNumbers(ids(e, "obsoletes")),
    obsoletedBy: toNumbers(ids(e, "obsoleted-by")),
    updates: toNumbers(ids(e, "updates")),
    updatedBy: toNumbers(ids(e, "updated-by")),
    status: STATUS_NAMES[status] ?? status,
    publishedAs: pubStatus && pubStatus !== status ? (STATUS_NAMES[pubStatus] ?? pubStatus) : undefined,
    stream: childText(e, "stream"),
    wg: childText(e, "wg_acronym"),
  };
}

/**
 * @returns {{rfcs: Map<number, object>, notIssued: Set<number>, series: Map<string, number[]>, drafts: Map<string, number>, latest: number}}
 */
export function parseRfcIndex(xml) {
  const doc = parseXml(xml);
  if (doc.name !== "rfc-index") throw new Error("not an rfc-index document");
  const rfcs = new Map();
  const notIssued = new Set();
  const series = new Map();
  const drafts = new Map();
  let latest = 0;
  for (const e of doc.children) {
    if (e.name === "rfc-entry") {
      const r = parseEntry(e);
      if (r.n === undefined) continue;
      rfcs.set(r.n, r);
      if (r.n > latest) latest = r.n;
      const base = r.draft && draftBase(r.draft);
      if (base) drafts.set(base, r.n);
    } else if (e.name === "rfc-not-issued-entry") {
      const n = rfcNumber(childText(e, "doc-id"));
      if (n !== undefined) notIssued.add(n);
    } else if (e.name === "bcp-entry" || e.name === "std-entry" || e.name === "fyi-entry") {
      const id = seriesId(childText(e, "doc-id") ?? "");
      if (id) series.set(id, toNumbers(ids(e, "is-also")));
    }
  }
  if (rfcs.size === 0) throw new Error("the RFC index had no entries");
  return { rfcs, notIssued, series, drafts, latest };
}

export const rfcId = (n) => `RFC${n}`;
export const rfcUrl = (n) => `https://www.rfc-editor.org/rfc/rfc${n}.html`;
export const infoUrl = (n) => `https://www.rfc-editor.org/info/rfc${n}`;

/**
 * Follows obsoleted-by links to the documents that replace an RFC today: the ends of every
 * chain, in number order. [] when the RFC is not obsolete.
 */
export function currentReplacements(index, n) {
  const start = index.rfcs.get(n);
  if (!start?.obsoletedBy.length) return [];
  const seen = new Set([n]);
  const leaves = new Set();
  const stack = [...start.obsoletedBy];
  while (stack.length) {
    const m = stack.pop();
    if (seen.has(m)) continue;
    seen.add(m);
    const next = index.rfcs.get(m)?.obsoletedBy ?? [];
    if (next.length === 0) leaves.add(m);
    else stack.push(...next);
  }
  return [...leaves].sort((a, b) => a - b);
}

// Words that carry no meaning for matching.
const STOP = new Set(["a", "an", "and", "the", "of", "for", "in", "on", "to", "with", "by", "rfc", "rfcs", "protocol"]);
const words = (s) => s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w && !STOP.has(w));

// A query word matches its plural too ("cookie" finds "cookies"), and a long plural matches its
// singular ("headers" finds "header"). Short words are left alone so "https" never finds "http".
const hasWord = (set, t) => set.has(t) || set.has(`${t}s`) || set.has(`${t}es`) || (t.length > 5 && t.endsWith("s") && set.has(t.slice(0, -1)));

// Word sets per RFC, built on the first search and kept with the index.
function searchable(index) {
  if (!index.searchable) {
    index.searchable = new Map();
    for (const r of index.rfcs.values()) index.searchable.set(r.n, { title: new Set(words(r.title)), kw: new Set(words(r.keywords.join(" "))), abs: new Set(words(r.abstract)) });
  }
  return index.searchable;
}

/**
 * Ranks RFCs by the query's words in title (3), keywords (2) and abstract (1); every word must
 * appear somewhere. The whole query as a phrase in the title adds 6. Obsolete RFCs score half,
 * so the current document outranks the one it replaced.
 */
export function searchIndex(index, query, { statuses, includeObsolete = true, fromYear, toYear } = {}) {
  const terms = words(query);
  const phrase = query.trim().toLowerCase();
  if (terms.length === 0 && !phrase) return [];
  const sets = searchable(index);
  const hits = [];
  for (const r of index.rfcs.values()) {
    if (statuses?.length && !statuses.includes(r.status)) continue;
    if (!includeObsolete && r.obsoletedBy.length) continue;
    if (fromYear && (r.year ?? 0) < fromYear) continue;
    if (toYear && (r.year ?? 9999) > toYear) continue;
    const title = r.title.toLowerCase();
    const w = sets.get(r.n);
    let score = 0;
    let all = true;
    for (const t of terms) {
      const s = (hasWord(w.title, t) ? 3 : 0) + (hasWord(w.kw, t) ? 2 : 0) + (hasWord(w.abs, t) ? 1 : 0);
      if (s === 0) {
        all = false;
        break;
      }
      score += s;
    }
    if (!all || (terms.length === 0 && !title.includes(phrase))) continue;
    if (phrase.length > 2 && title.includes(phrase)) score += 6;
    if (r.obsoletedBy.length) score /= 2;
    hits.push({ r, score });
  }
  hits.sort((a, b) => b.score - a.score || b.r.n - a.r.n);
  return hits.map((h) => h.r);
}
