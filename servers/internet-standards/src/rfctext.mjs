// src/rfctext.mjs
//
// Splits an RFC's plain text into its sections. The text is the RFC Editor's published .txt,
// which is the one format every RFC with text has. Paginated RFCs (most before RFC 8650) carry a
// footer ("Fielding, et al.  Standards Track  [Page 12]"), a form feed and a running header on
// every page; those are removed and the pages rejoined, so a section reads as one piece. Section
// headings are found at the left margin and must follow each other in order, which keeps
// numbered lists and table-of-contents lines from being read as headings.

const MONTHS = "January|February|March|April|May|June|July|August|September|October|November|December";
const RUNNING_HEADER = new RegExp(`^\\s*(?:RFC[ -]?\\d+\\b|(?:${MONTHS})\\s+\\d{4}\\s*$)|(?:${MONTHS})\\s+\\d{4}\\s*$`);
const FOOTER = /\[Page\s+[0-9ivxlc]+\]\s*$/i;

const NUMBERED = /^(\d{1,2}(?:\.\d{1,3}){0,6})\.?\s{1,6}(\S.{0,110})$/;
const APPENDIX = /^Appendix\s+([A-Z])(?:\.|:|\s)\s*(\S.{0,110})?$/i;
const APPENDIX_SUB = /^([A-Z])((?:\.\d{1,3}){1,6})\.?\s{1,6}(\S.{0,110})$/;
const UNNUMBERED = new Set([
  "abstract",
  "status of this memo",
  "status of this document",
  "copyright notice",
  "table of contents",
  "acknowledgements",
  "acknowledgments",
  "acknowledgement",
  "acknowledgment",
  "authors' addresses",
  "author's address",
  "authors addresses",
  "author's addresses",
  "contributors",
  "index",
  "full copyright statement",
  "intellectual property",
  "intellectual property statement",
  "references",
  "normative references",
  "informative references",
]);
const DOT_LEADER = /(?:\.\s?){3,}\s*\d*\s*$/;

/** Removes page footers, form feeds and running headers, and rejoins the pages. */
export function stripPagination(text) {
  const raw = text.replace(/\r\n?/g, "\n");
  const pages = raw.split("\f");
  if (pages.length === 1) return raw.split("\n").map((l) => l.replace(/\s+$/, ""));
  const out = [];
  pages.forEach((page, i) => {
    let lines = page.split("\n").map((l) => l.replace(/\s+$/, ""));
    while (lines.length && lines.at(-1) === "") lines.pop();
    if (lines.length && FOOTER.test(lines.at(-1))) lines.pop();
    while (lines.length && lines.at(-1) === "") lines.pop();
    let k = 0;
    while (k < lines.length && lines[k] === "") k++;
    if (i > 0 && k < lines.length && RUNNING_HEADER.test(lines[k])) {
      // A running header is one to three lines ("RFC 2616  HTTP/1.1  June 1999", or RFC 791's
      // date, title and chapter lines), ended by a blank line.
      const start = k;
      while (k < lines.length && lines[k] !== "" && k - start < 3) k++;
    }
    while (k < lines.length && lines[k] === "") k++;
    lines = lines.slice(k);
    if (!lines.length) return;
    if (out.length) {
      const prev = out.at(-1).trim();
      const next = lines[0];
      // A page that ends mid-sentence continues on the next page; anything else was a paragraph
      // or block boundary, and keeps one blank line.
      const continues = prev !== "" && !/[.:;!?)\]}"'>|*+-]$/.test(prev) && /^\s/.test(next);
      if (!continues && out.at(-1) !== "") out.push("");
    }
    out.push(...lines);
  });
  return out;
}

function numberedTuple(id) {
  return id.split(".").map(Number);
}

// Whether heading number t can follow heading number p: its first child, or the next number at
// some level (gaps of up to three are allowed, since RFCs skip numbers and the parser can miss
// a heading), with any deeper parts starting low.
export function canFollow(p, t) {
  if (!p) return t[0] <= 3 && t.slice(1).every((x) => x <= 2);
  let l = 0;
  while (l < p.length && l < t.length && p[l] === t[l]) l++;
  if (l === t.length) return false; // equal to, or an ancestor of, the previous heading
  if (l === p.length) return t.length === p.length + 1 && t[l] <= 2;
  const step = t[l] - p[l];
  return step >= 1 && step <= 3 && t.slice(l + 1).every((x) => x <= 2);
}

/**
 * Finds the section headings in an RFC's lines.
 * @returns {{id: string, title: string, depth: number, line: number}[]}
 */
export function findHeadings(lines) {
  const heads = [];
  let lastNum;
  let lastAppendix = "";
  let lastAppendixSub;
  lines.forEach((line, i) => {
    if (!line || /^\s/.test(line) || line.length > 120) return;
    if (i > 0 && lines[i - 1] !== "") return; // headings follow a blank line
    if (DOT_LEADER.test(line)) return; // a table-of-contents entry
    const trimmed = line.trim();
    const bare = trimmed.replace(/:$/, "").toLowerCase();
    if (UNNUMBERED.has(bare)) {
      heads.push({ id: trimmed.replace(/:$/, ""), title: trimmed.replace(/:$/, ""), depth: 1, line: i, unnumbered: true });
      return;
    }
    let m = trimmed.match(APPENDIX);
    if (m) {
      const letter = m[1].toUpperCase();
      if (letter > lastAppendix) {
        lastAppendix = letter;
        lastAppendixSub = undefined;
        heads.push({ id: letter, title: (m[2] ?? "").trim(), depth: 1, line: i });
      }
      return;
    }
    m = trimmed.match(APPENDIX_SUB);
    if (m && (m[1] === lastAppendix || (lastAppendix && m[1] === String.fromCharCode(lastAppendix.charCodeAt(0) + 1)))) {
      const t = numberedTuple(m[2].slice(1));
      if (m[1] !== lastAppendix) {
        lastAppendix = m[1];
        lastAppendixSub = undefined;
      }
      if (canFollow(lastAppendixSub, t) || (!lastAppendixSub && t.length === 1)) {
        lastAppendixSub = t;
        heads.push({ id: `${m[1]}.${t.join(".")}`, title: m[3].trim(), depth: t.length + 1, line: i });
      }
      return;
    }
    m = trimmed.match(NUMBERED);
    if (m && !/[,;]$/.test(m[2])) {
      const t = numberedTuple(m[1]);
      if (!lastAppendix && canFollow(lastNum, t)) {
        lastNum = t;
        heads.push({ id: t.join("."), title: m[2].trim(), depth: t.length, line: i });
      }
    }
  });
  return heads;
}

/** Parses an RFC's text into lines and sections. */
export function parseRfcText(text) {
  const lines = stripPagination(text);
  const heads = findHeadings(lines);
  const sections = heads.map((h, i) => {
    // A section's own text runs to the next heading; its subtree runs to the next heading that
    // is not below it.
    let end = lines.length;
    for (let j = i + 1; j < heads.length; j++) {
      if (heads[j].depth <= h.depth || heads[j].unnumbered || h.unnumbered || !isBelow(heads[j].id, h.id)) {
        end = heads[j].line;
        break;
      }
    }
    return { ...h, ownEnd: heads[i + 1]?.line ?? lines.length, treeEnd: end };
  });
  return { lines, sections };
}

const isBelow = (id, parent) => id.startsWith(`${parent}.`);

/** Section text with blank-line runs collapsed and the common indent removed. */
export function sectionText(doc, section, { subtree = false } = {}) {
  const body = doc.lines.slice(section.line + 1, subtree ? section.treeEnd : section.ownEnd);
  const kept = [];
  for (const l of body) if (l !== "" || (kept.length && kept.at(-1) !== "")) kept.push(l);
  while (kept.length && kept.at(-1) === "") kept.pop();
  const indent = Math.min(...kept.filter(Boolean).map((l) => l.match(/^ */)[0].length));
  return Number.isFinite(indent) && indent > 0 ? kept.map((l) => l.slice(indent)).join("\n") : kept.join("\n");
}

/** "Section 15.5.5", "§ 4.1.", "Appendix A.1", "appendix-B", "section-3" -> a section id. */
export function normalizeSectionId(raw) {
  const s = String(raw)
    .trim()
    .replace(/^(?:§\s*|sec(?:tion)?[\s.-]*)/i, "")
    .replace(/\.$/, "");
  const appx = s.match(/^(?:appendix|app\.?)[\s-]*([A-Z])((?:\.\d+)*)$/i) ?? s.match(/^([A-Z])((?:\.\d+)+)$/i) ?? s.match(/^([A-Z])$/);
  if (appx) return `${appx[1].toUpperCase()}${appx[2] ?? ""}`;
  if (/^\d+(?:\.\d+)*$/.test(s)) return s.split(".").map(Number).join(".");
  return undefined;
}

/**
 * Finds a section by id or by title. Title matching is case-insensitive: an exact title wins,
 * then a title that contains the words.
 * @returns {{section?: object, candidates?: object[]}}
 */
export function findSection(doc, raw) {
  const id = normalizeSectionId(raw);
  if (id) {
    const hit = doc.sections.find((s) => s.id === id);
    if (hit) return { section: hit };
  }
  const q = String(raw).trim().toLowerCase().replace(/\s+/g, " ");
  const exact = doc.sections.filter((s) => s.title.toLowerCase() === q || s.id.toLowerCase() === q);
  if (exact.length === 1) return { section: exact[0] };
  const partial = exact.length ? exact : doc.sections.filter((s) => s.title.toLowerCase().includes(q));
  if (partial.length === 1) return { section: partial[0] };
  return { candidates: partial };
}

const flat = (s) => s.replace(/-\n\s*/g, "-").replace(/\s+/g, " ");

/**
 * Sections whose own text contains a phrase, ignoring line breaks and case.
 * @returns {{id: string, title: string, hits: number, snippet: string}[]}
 */
export function searchSections(doc, phrase) {
  const needle = flat(phrase.trim()).toLowerCase();
  if (!needle) return [];
  const out = [];
  const regions = [{ id: "", title: "", line: -1, ownEnd: doc.sections[0]?.line ?? doc.lines.length }, ...doc.sections];
  for (const s of regions) {
    const text = flat(doc.lines.slice(s.line + 1, s.ownEnd).join("\n")).trim();
    const hay = text.toLowerCase();
    let at = hay.indexOf(needle);
    if (at < 0) continue;
    let hits = 0;
    for (let i = at; i >= 0; i = hay.indexOf(needle, i + needle.length)) hits++;
    const from = Math.max(0, at - 80);
    const to = Math.min(text.length, at + needle.length + 80);
    const snippet = `${from > 0 ? "..." : ""}${text.slice(from, to)}${to < text.length ? "..." : ""}`;
    out.push(s.id ? { section: s.id, title: s.title, hits, snippet } : { section: "(front matter)", hits, snippet });
  }
  return out;
}
