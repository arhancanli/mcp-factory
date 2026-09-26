// src/text.mjs
//
// Text normalisation and similarity. Titles and names reach us with HTML or MathML markup,
// LaTeX-decoded accents, British and American spellings and reordered words; everything here
// reduces them to comparable token lists and measures how much of one appears in the other.

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "-", mdash: "-", hellip: "..." };

export function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? Number.parseInt(e.slice(2), 16) : Number(e.slice(1));
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** Removes markup such as <i>, <sub> or <mml:math> and decodes entities; keeps the text inside. */
export function stripMarkup(s) {
  if (typeof s !== "string") return "";
  return decodeEntities(s.replace(/<[^>]{0,500}>/g, " ")).replace(/\s+/g, " ").trim();
}

const FOLD = { "ß": "ss", "æ": "ae", "Æ": "AE", "œ": "oe", "Œ": "OE", "ø": "o", "Ø": "O", "ł": "l", "Ł": "L", "đ": "d", "Đ": "D", "þ": "th", "Þ": "TH", "ı": "i", "ð": "d" };

/** Accents and ligatures to plain letters: "Schrödinger" and "Schrodinger" compare equal. */
export function fold(s) {
  return s
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .replace(/[ßæÆœŒøØłŁđĐþÞıð]/g, (c) => FOLD[c]);
}

/** Lowercase letters and digits separated by single spaces. */
export function norm(s) {
  return fold(stripMarkup(String(s ?? "")))
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export const tokens = (s) => {
  const n = norm(s);
  return n ? n.split(" ") : [];
};

// Notice prefixes that publishers add to a retracted or withdrawn paper's title.
const NOTICE_PREFIX = /^\s*(?:retracted(?:\s+article)?|withdrawn(?:\s+article)?|removed|retraction)\s*[:.]\s*/i;
export const stripNoticePrefix = (title) => String(title ?? "").replace(NOTICE_PREFIX, "");

// Titles of works that are about another work: they repeat its title, so a title match alone
// would wrongly take a comment or a review for the paper it discusses.
const DERIVATIVE = /^(?:comments? on|reply to|replies to|response to|responses to|correction to|corrigendum to|erratum to|retraction of|retraction note|notice of retraction|expression of concern|faculty opinions recommendation of|f1000prime recommendation of|review of|author correction|publisher correction|editorial expression of concern|re)\b/;
export const isDerivativeTitle = (normTitle) => DERIVATIVE.test(normTitle);
// A citation that names such a notice anywhere ("Editors. Retraction note: ...") cites the notice.
const DERIVATIVE_ANYWHERE = new RegExp(DERIVATIVE.source.replace(/^\^/, "\\b"));
export const mentionsDerivative = (normText) => DERIVATIVE_ANYWHERE.test(normText);

// Damerau-Levenshtein (optimal string alignment) distance, capped: returns cap + 1 when larger.
export function editDistance(a, b, cap = 3) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  const rows = a.length + 1;
  const cols = b.length + 1;
  let prev2 = null;
  let prev = Array.from({ length: cols }, (_, j) => j);
  for (let i = 1; i < rows; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (prev2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur.push(v);
      if (v < best) best = v;
    }
    if (best > cap) return cap + 1;
    prev2 = prev;
    prev = cur;
  }
  return Math.min(prev[cols - 1], cap + 1);
}

/** Two tokens are the same word: equal, or long and one typo or spelling variant apart. */
export function sameToken(a, b) {
  if (a === b) return true;
  const n = Math.min(a.length, b.length);
  if (n < 5 || /\d/.test(a) || /\d/.test(b)) return false;
  return editDistance(a, b, 2) <= (n >= 9 ? 2 : 1);
}

/** Longest common subsequence of two token lists, with sameToken as equality. */
export function lcs(a, b) {
  if (!a.length || !b.length) return 0;
  let prev = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    const cur = [0];
    for (let j = 1; j <= b.length; j++) cur.push(sameToken(a[i - 1], b[j - 1]) ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]));
    prev = cur;
  }
  return prev[b.length];
}

/** Symmetric title similarity in [0, 1]: 2 * LCS / (len a + len b). */
export function dice(a, b) {
  if (!a.length || !b.length) return 0;
  return (2 * lcs(a, b)) / (a.length + b.length);
}

/**
 * How much of `needle` (a record's title) appears, in order, inside a short window of `hay` (a
 * free-text citation). Returns the covered share and where the best window starts and ends in
 * `hay`, so the caller knows which part of the citation holds the title and which the authors.
 */
export function coverage(needle, hay) {
  const m = needle.length;
  if (!m || !hay.length) return { share: 0, start: -1, end: -1 };
  const slack = Math.max(3, Math.ceil(m / 3));
  let best = { share: 0, start: -1, end: -1 };
  for (let i = 0; i < hay.length; i++) {
    if (!needle.some((t) => sameToken(t, hay[i]))) continue;
    const win = hay.slice(i, i + m + slack);
    // LCS with the last matched position, so the window's real end is known.
    const dp = Array.from({ length: m + 1 }, () => new Array(win.length + 1).fill(0));
    for (let a = 1; a <= m; a++) {
      for (let b = 1; b <= win.length; b++) dp[a][b] = sameToken(needle[a - 1], win[b - 1]) ? dp[a - 1][b - 1] + 1 : Math.max(dp[a - 1][b], dp[a][b - 1]);
    }
    const hit = dp[m][win.length];
    if (hit / m > best.share) {
      let end = win.length;
      while (end > 0 && dp[m][end - 1] === hit) end--;
      best = { share: hit / m, start: i, end: i + end };
    }
    if (best.share === 1) break;
  }
  return best;
}

// Name particles that belong to the family name: "van der Maaten", "de Gennes".
const PARTICLES = new Set(["van", "von", "der", "den", "de", "del", "della", "di", "da", "dos", "du", "la", "le", "ter", "ten", "bin", "al", "el", "st"]);
const SUFFIX = /^(?:jr|sr|ii|iii|iv)\.?$/i;

/** Splits "Given Family" (as arXiv and OpenAlex write names) into family and given parts. */
export function splitDisplayName(name) {
  const words = String(name ?? "").trim().split(/\s+/).filter(Boolean);
  while (words.length > 1 && SUFFIX.test(words.at(-1))) words.pop();
  if (words.length <= 1) return { family: words[0] ?? "", given: "" };
  let k = words.length - 1;
  while (k > 1 && PARTICLES.has(words[k - 1].toLowerCase())) k--;
  return { family: words.slice(k).join(" "), given: words.slice(0, k).join(" ") };
}

/** Family names compare equal across diacritics, hyphens, particles and one typo. */
export function sameFamily(a, b) {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return false;
  if (x === y || x.replace(/ /g, "") === y.replace(/ /g, "")) return true;
  const lx = x.split(" ").at(-1);
  const ly = y.split(" ").at(-1);
  if (lx === ly && lx.length >= 4) return true;
  const n = Math.min(x.length, y.length);
  return n >= 6 && editDistance(x.replace(/ /g, ""), y.replace(/ /g, ""), 1) <= 1;
}

/** True when a family name occurs as a token run inside a token list. */
export function familyIn(family, toks) {
  const f = tokens(family);
  if (!f.length) return false;
  const joined = f.join("");
  for (let i = 0; i < toks.length; i++) {
    if (f.every((t, k) => toks[i + k] !== undefined && sameToken(t, toks[i + k]))) return true;
    if (toks[i] === joined || (f.length === 1 && f[0].length >= 4 && toks[i] === f[0])) return true;
  }
  return false;
}

export const clipText = (s, n) => (s.length <= n ? s : `${s.slice(0, n - 3).trimEnd()}...`);

/**
 * The title a comment, reply or recommendation is about: "Comment on “A Bacterium ...”" and
 * "Faculty Opinions recommendation of A bacterium ..." both name the work they discuss.
 */
export function discussedTitle(title) {
  const t = String(title ?? "");
  const quoted = t.match(/[\u201c"]([^\u201d"]{10,})[\u201d"]/);
  if (quoted) return quoted[1].trim();
  const m = t.match(/^(?:comments? on|reply to|replies to|response to|correction to|retraction of|review of|faculty opinions recommendation of|f1000prime recommendation of)\s*[:.]?\s*(.{10,})$/i);
  return m ? m[1].trim() : undefined;
}
