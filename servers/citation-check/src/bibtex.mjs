// src/bibtex.mjs
//
// BibTeX in and out. Reading: entries, @string macros, braces, quotes, # concatenation and LaTeX
// accents, so a .bib file exported from any reference manager parses. Writing: one clean entry
// per verified record, keeping the author's citation key so \cite commands keep working.
import { fold, splitDisplayName, stripMarkup, stripNoticePrefix } from "./text.mjs";

const MONTHS = { jan: "January", feb: "February", mar: "March", apr: "April", may: "May", jun: "June", jul: "July", aug: "August", sep: "September", oct: "October", nov: "November", dec: "December" };

/** Index of the character closing the entry that starts at `from`, or -1 when unbalanced. */
function findClose(text, from, close) {
  let depth = 0;
  for (let i = from; i < text.length; i++) {
    const c = text[i];
    if (c === "\\") {
      i++;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") {
      if (depth === 0) return close === "}" ? i : -1;
      depth--;
    } else if (c === close && depth === 0) return i;
  }
  return -1;
}

function readBalanced(s, i) {
  // s[i] is "{"; returns [inner, index after the closing brace]
  let depth = 0;
  for (let j = i; j < s.length; j++) {
    if (s[j] === "\\") {
      j++;
      continue;
    }
    if (s[j] === "{") depth++;
    else if (s[j] === "}" && --depth === 0) return [s.slice(i + 1, j), j + 1];
  }
  return [s.slice(i + 1), s.length];
}

function readQuoted(s, i) {
  let depth = 0;
  for (let j = i + 1; j < s.length; j++) {
    if (s[j] === "\\") {
      j++;
      continue;
    }
    if (s[j] === "{") depth++;
    else if (s[j] === "}") depth--;
    else if (s[j] === '"' && depth === 0) return [s.slice(i + 1, j), j + 1];
  }
  return [s.slice(i + 1), s.length];
}

function parseFields(body, macros) {
  const fields = {};
  let i = 0;
  while (i < body.length) {
    while (i < body.length && /[\s,]/.test(body[i])) i++;
    const m = /^([A-Za-z][\w\-:.+]*)\s*=\s*/.exec(body.slice(i, i + 200));
    if (!m) {
      const next = body.indexOf(",", i);
      if (next < 0) break;
      i = next + 1;
      continue;
    }
    i += m[0].length;
    const parts = [];
    for (;;) {
      while (/\s/.test(body[i] ?? "")) i++;
      let part;
      if (body[i] === "{") [part, i] = readBalanced(body, i);
      else if (body[i] === '"') [part, i] = readQuoted(body, i);
      else {
        const w = /^[^\s,#]+/.exec(body.slice(i))?.[0] ?? "";
        i += w.length;
        part = /^\d+$/.test(w) ? w : (macros[w.toLowerCase()] ?? w);
      }
      parts.push(part);
      while (/\s/.test(body[i] ?? "")) i++;
      if (body[i] === "#") {
        i++;
        continue;
      }
      break;
    }
    fields[m[1].toLowerCase()] = parts.join("");
  }
  return fields;
}

/** @returns {{type: string, key: string, fields: Record<string,string>}[]} */
export function parseBibtex(text) {
  const entries = [];
  const macros = { ...MONTHS };
  let i = 0;
  for (;;) {
    const at = text.indexOf("@", i);
    if (at < 0) break;
    const m = /^@\s*([A-Za-z]+)\s*([{(])/.exec(text.slice(at, at + 80));
    if (!m) {
      i = at + 1;
      continue;
    }
    const type = m[1].toLowerCase();
    const start = at + m[0].length;
    const end = findClose(text, start, m[2] === "{" ? "}" : ")");
    if (end < 0) {
      i = at + 1;
      continue;
    }
    const body = text.slice(start, end);
    i = end + 1;
    if (type === "comment" || type === "preamble") continue;
    if (type === "string") {
      Object.assign(macros, Object.fromEntries(Object.entries(parseFields(body, macros)).map(([k, v]) => [k.toLowerCase(), v])));
      continue;
    }
    const comma = body.indexOf(",");
    const key = (comma < 0 ? body : body.slice(0, comma)).trim();
    entries.push({ type, key, fields: comma < 0 ? {} : parseFields(body.slice(comma + 1), macros) });
  }
  return entries;
}

const ACCENT = { "'": "́", "`": "̀", "^": "̂", '"': "̈", "~": "̃", "=": "̄", ".": "̇", u: "̆", v: "̌", H: "̋", c: "̧", k: "̨", r: "̊", d: "̣", b: "̱" };
const SPECIAL = { ss: "ß", o: "ø", O: "Ø", aa: "å", AA: "Å", ae: "æ", AE: "Æ", oe: "œ", OE: "Œ", l: "ł", L: "Ł", i: "i", j: "j" };

/** LaTeX to plain Unicode text: accents, escaped symbols, formatting commands, braces. */
export function latexToText(s) {
  let t = String(s ?? "");
  t = t.replace(/\\(ss|aa|AA|ae|AE|oe|OE|o|O|l|L|i|j)(?![A-Za-z])\s?/g, (m, c) => SPECIAL[c]);
  t = t.replace(/\\(['`^"~=.])\s*(?:\{\s*([A-Za-z])\s*\}|([A-Za-z]))/g, (m, a, x, y) => (x ?? y) + ACCENT[a]);
  t = t.replace(/\\([uvHckrdb])(?:\s*\{\s*([A-Za-z])\s*\}|\s+([A-Za-z]))/g, (m, a, x, y) => (x ?? y) + ACCENT[a]);
  t = t.replace(/\\([&%$#_{}])/g, "$1");
  for (let k = 0; k < 4; k++) t = t.replace(/\\[A-Za-z]+\*?\s*(?:\[[^\]]*\])?\s*\{([^{}]*)\}/g, "$1");
  t = t.replace(/\\[A-Za-z]+\*?/g, " ").replace(/[{}$]/g, "").replace(/~/g, " ").replace(/-{2,3}/g, "-");
  return t.normalize("NFC").replace(/\s+/g, " ").trim();
}

/** Splits a BibTeX author field into names; "and others" sets etal. */
export function parseNames(field) {
  const names = [];
  let etal = false;
  let depth = 0;
  let cur = "";
  const parts = [];
  const s = String(field ?? "");
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "{") depth++;
    else if (s[i] === "}") depth--;
    if (depth === 0 && /\s/.test(s[i]) && /^and\s/i.test(s.slice(i + 1, i + 5)) && cur.trim()) {
      parts.push(cur);
      cur = "";
      i += 4;
      continue;
    }
    cur += s[i];
  }
  if (cur.trim()) parts.push(cur);
  for (const raw of parts) {
    const p = raw.trim();
    if (/^others$/i.test(p) || /^et\.? al\.?$/i.test(p)) {
      etal = true;
      continue;
    }
    if (/^\{[^{}]*\}$/.test(p)) {
      names.push({ family: latexToText(p), given: "", org: true });
      continue;
    }
    const commaParts = splitTopLevel(p, ",");
    if (commaParts.length >= 2) {
      names.push({ family: latexToText(commaParts[0]), given: latexToText(commaParts.at(-1)) });
    } else {
      const { family, given } = splitDisplayName(latexToText(p));
      names.push({ family, given });
    }
  }
  return { names: names.filter((n) => n.family), etal };
}

function splitTopLevel(s, sep) {
  const out = [];
  let depth = 0;
  let cur = "";
  for (const c of s) {
    if (c === "{") depth++;
    else if (c === "}") depth--;
    if (c === sep && depth === 0) {
      out.push(cur.trim());
      cur = "";
    } else cur += c;
  }
  out.push(cur.trim());
  return out.filter(Boolean);
}

// ---------------------------------------------------------------------------------------------
// Writing

const BIB_TYPE = { article: "article", inproceedings: "inproceedings", incollection: "incollection", book: "book", thesis: "phdthesis", report: "techreport", preprint: "misc", dataset: "misc", software: "misc", misc: "misc" };

const escapeBib = (s) => String(s).replace(/[{}]/g, "").replace(/([&%$#_])/g, "\\$1");

const STOP = new Set(["a", "an", "the", "of", "on", "in", "for", "and", "to", "with", "by", "at", "from", "is", "are", "towards", "toward"]);

/** A citation key such as kucsko2013nanometre, ASCII only. */
export function makeKey(rec) {
  const fam = fold(rec.authors?.[0]?.family ?? "anon").toLowerCase().replace(/[^a-z]/g, "") || "anon";
  const word = fold(stripNoticePrefix(stripMarkup(rec.title ?? ""))).toLowerCase().split(/[^a-z0-9]+/).find((w) => w && !STOP.has(w)) ?? "";
  return `${fam}${rec.year ?? ""}${word}`;
}

const formatName = (a) => (a.org ? `{${escapeBib(a.family)}}` : a.given ? `${escapeBib(a.family)}, ${escapeBib(a.given)}` : escapeBib(a.family));

export const MAX_BIB_AUTHORS = 100;

/** One BibTeX entry for a normalised record (see sources/*.mjs for the record shape). */
export function toBibtex(rec, key) {
  const type = BIB_TYPE[rec.kind] ?? "misc";
  const fields = [];
  const add = (k, v) => {
    if (v !== undefined && v !== null && String(v).trim() !== "") fields.push([k, String(v)]);
  };
  const authors = rec.authors ?? [];
  if (authors.length) add("author", authors.slice(0, MAX_BIB_AUTHORS).map(formatName).join(" and ") + (authors.length > MAX_BIB_AUTHORS || rec.authorsTruncated ? " and others" : ""));
  // The publisher's "RETRACTED:" watermark is not part of the title a citation should use; the
  // retraction is reported in the result's flags instead.
  const base = stripNoticePrefix(rec.title ?? "");
  const title = rec.subtitle && !base.toLowerCase().includes(rec.subtitle.toLowerCase()) ? `${base}: ${rec.subtitle}` : base;
  add("title", escapeBib(stripMarkup(title)));
  if (type === "article") add("journal", rec.venue && escapeBib(rec.venue));
  else if (type === "inproceedings" || type === "incollection") add("booktitle", rec.venue && escapeBib(rec.venue));
  else if (rec.kind === "preprint" && rec.venue && !rec.arxiv) add("howpublished", escapeBib(rec.venue));
  add("year", rec.year);
  add("volume", rec.volume && escapeBib(rec.volume));
  add("number", rec.issue && escapeBib(rec.issue));
  add("pages", rec.pages && escapeBib(rec.pages.replace(/\s*[-–]+\s*/g, "--")));
  if (type === "book" || type === "incollection" || type === "techreport" || type === "misc") add("publisher", rec.publisher && rec.publisher !== rec.venue ? escapeBib(rec.publisher) : undefined);
  if (type === "phdthesis") add("school", rec.publisher && escapeBib(rec.publisher));
  add("doi", rec.doi);
  if (rec.arxiv) {
    add("eprint", rec.arxiv);
    add("archiveprefix", "arXiv");
    add("primaryclass", rec.arxivClass);
  }
  if (rec.pmid) add("pmid", rec.pmid);
  const body = fields.map(([k, v]) => `  ${k} = {${v}}`).join(",\n");
  return `@${type}{${key || makeKey(rec)},\n${body}\n}`;
}
