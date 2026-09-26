// src/match.mjs
//
// Deciding whether a record is the work a citation means, and how they differ. Titles decide
// identity; first author and year decide whether the citation describes the work correctly.
//   verified     the record is the cited work and the citation's title, first author and year agree
//   mismatch     the cited work was found (or the cited identifier resolves) but the citation gets
//                a field wrong, or the identifier points at a different work
//   not_found    no source holds a work that matches: possibly fabricated, or not indexed
//   unverifiable the identifier exists, but no source returns metadata to check it against
import { findArxiv, findDoi, findPmid, findYears } from "./ids.mjs";
import { latexToText, parseNames } from "./bibtex.mjs";
import { coverage, dice, familyIn, isDerivativeTitle, mentionsDerivative, norm, sameFamily, stripNoticePrefix, tokens } from "./text.mjs";

export const TITLE_MATCH = 0.85; // share of the record's title found in the citation (or Dice for explicit titles)
export const DIFFERENT_WORK = 0.5; // below this, an identifier points at a different work
export const CLOSEST_SHOWN = 0.6;
const MIN_TITLE_TOKENS = 3;

/** A citation from free text. Titles are taken from quotes or APA-style "(2020). Title." when present. */
export function fromText(raw) {
  const text = String(raw).replace(/^\s*(?:\[\d+\]|\(\d+\)|\d+[.)])\s*/, "").trim();
  const quoted = text.match(/[“"]([^”"]{15,400})[”"]/)?.[1];
  const apa = text.match(/\((?:1[89]|20)\d{2}[a-z]?\)\.\s+([^.?!]{15,400}[.?!])/)?.[1]?.replace(/[.]$/, "");
  // First author's family name: "A. Vaswani", "Vaswani, A.", "Vaswani A," (Vancouver) or "van der Maaten L,".
  const lead = text.match(/^\s*(?:(?:[A-Z]\.\s*){1,3}([\p{Lu}][\p{L}'’-]+)|((?:(?:van|von|de|der|den|del|da|di|la|le)\s+)*[\p{Lu}][\p{L}'’-]+)(?:\s+[A-Z]{1,3}\.?)?\s*[,.])/u);
  // For searching only (never for scoring): in "Authors. Title. Journal. Year." layouts the title is
  // the segment after the author list.
  const segs = text.split(/\.\s+(?=[\p{Lu}\d"“])/u);
  const authorish = /(?:et al|(?:^|[\s,])[A-Z]{1,3}$|,\s*[A-Z]\.?$)/u.test(segs[0] ?? "");
  const guessTitle = !quoted && !apa && authorish && segs[1] && segs[1].split(/\s+/).length >= 3 ? segs[1].replace(/\.$/, "") : undefined;
  return {
    raw: text,
    tokens: tokens(text),
    guessTitle,
    title: quoted ?? apa,
    firstFamily: lead ? (lead[1] ?? lead[2]) : undefined,
    years: findYears(text),
    doi: findDoi(text),
    arxiv: findArxiv(text),
    pmid: findPmid(text),
  };
}

/** A citation from a parsed BibTeX entry: explicit fields, LaTeX decoded. */
export function fromBibtex(entry) {
  const f = entry.fields;
  const title = f.title ? latexToText(f.title) : undefined;
  const { names } = parseNames(f.author ?? f.editor ?? "");
  const plain = [names.map((n) => n.family).join(", "), title, f.journal ?? f.booktitle, f.year].filter(Boolean).map(latexToText).join(". ");
  const idText = [f.doi, f.url, f.eprint && `arXiv:${f.eprint}`, f.archiveprefix, f.pmid && `PMID ${f.pmid}`, f.note].filter(Boolean).join(" ");
  return {
    raw: `@${entry.type}{${entry.key}, ...}`,
    key: entry.key,
    bibType: entry.type,
    tokens: tokens(plain),
    title,
    authors: names,
    firstFamily: names[0]?.family,
    years: f.year ? findYears(f.year) : [],
    venue: f.journal || f.booktitle ? latexToText(f.journal ?? f.booktitle) : undefined,
    doi: findDoi(f.doi ?? "") ?? findDoi(idText),
    arxiv: f.eprint && /arxiv/i.test(`${f.archiveprefix ?? ""} ${f.eprinttype ?? ""} ${f.eprint}`) ? f.eprint.replace(/^arxiv:/i, "").replace(/v\d+$/, "") : findArxiv(idText),
    pmid: f.pmid ?? findPmid(idText),
  };
}

const titleVariants = (r) => [r.title, r.subtitle ? `${r.title} ${r.subtitle}` : null].filter(Boolean).map((t) => tokens(stripNoticePrefix(t)));

/** How well a record fits a citation. author and year are true, false, or null (cannot tell). */
export function compare(c, r) {
  const variants = titleVariants(r);
  let title = 0;
  let span = null;
  if (c.title) {
    const ct = tokens(stripNoticePrefix(c.title));
    for (const rt of variants) title = Math.max(title, dice(ct, rt));
  } else {
    for (const rt of variants) {
      const cov = coverage(rt, c.tokens);
      if (cov.share > title) {
        title = cov.share;
        span = cov;
      }
    }
    // A very short record title ("Nature") is found inside almost any citation; it cannot decide alone.
    if (Math.max(...variants.map((v) => v.length), 0) < MIN_TITLE_TOKENS) title = Math.min(title, 0.7);
  }

  let author = null;
  const rFirst = r.authors?.[0]?.family;
  if (rFirst) {
    if (c.authors?.length) author = sameFamily(c.authors[0].family, rFirst);
    else if (c.firstFamily) author = sameFamily(c.firstFamily, rFirst) || familyIn(rFirst, tokens(c.firstFamily));
    else {
      const seg = span && span.start > 0 ? c.tokens.slice(0, span.start) : null;
      if (seg?.length) author = familyIn(rFirst, seg);
    }
  }

  let year = null;
  if (c.years.length && r.years?.length) year = c.years.some((cy) => r.years.some((ry) => Math.abs(cy - ry) <= 1));
  return { title, author, year };
}

/** Rank for choosing among search candidates: identity first, then fit, then the source's order. */
export function rank(c, r, i) {
  const s = compare(c, r);
  const derivative = isDerivativeTitle(norm(stripNoticePrefix(r.title))) && !mentionsDerivative(norm(c.title ?? c.raw));
  return { s, derivative, score: s.title + (s.author === true ? 0.3 : s.author === false ? -0.3 : 0) + (s.year === true ? 0.2 : s.year === false ? -0.2 : 0) - (derivative ? 1 : 0) - i * 0.001 };
}

export function diffs(c, r, s) {
  const out = [];
  if (s.title < TITLE_MATCH && c.title) out.push({ field: "title", cited: c.title, record: r.title });
  if (s.author === false) out.push({ field: "first_author", cited: c.firstFamily ?? c.authors?.[0]?.family ?? "(not the record's first author)", record: r.authors[0].family });
  if (s.year === false) out.push({ field: "year", cited: c.years.join(" or "), record: r.years.join(" or ") });
  if (c.doi && r.doi && c.doi !== r.doi) out.push({ field: "doi", cited: c.doi, record: r.doi });
  return out;
}

const RETRACTION_NOTICE = /^(?:retraction(?:\s+note)?\b|notice of retraction\b|retraction of\b|withdrawal\b|retracted article:\s*retraction)/i;
export const isRetractionNotice = (r) => RETRACTION_NOTICE.test(r.title ?? "") && !/^retracted\s*:/i.test(r.title ?? "");
