// src/errata.mjs
//
// RFC errata from the RFC Editor's full errata export (one JSON array of every report). Reports
// are grouped by RFC, and the free-text "section" field each report carries ("4.1", "Appendix A",
// "5.1, pg.12", "6 and 7.1", "GLOBAL") is turned into section ids that match rfc_section's.

export const STATUS_KEYS = { Verified: "verified", "Held for Document Update": "held", Reported: "reported", Rejected: "rejected" };
export const STATUS_FILTERS = Object.values(STATUS_KEYS);

export const errataUrl = (id) => `https://www.rfc-editor.org/errata/eid${id}`;

const clean = (s) => (typeof s === "string" ? s.replace(/\r\n?/g, "\n").replace(/[ \t]+$/gm, "").replace(/^\n+|\s+$/g, "") : "");

/** @returns {Map<number, object[]>} reports per RFC number, newest id last */
export function parseErrata(list) {
  if (!Array.isArray(list)) throw new Error("the errata export is not a list");
  const byRfc = new Map();
  for (const e of list) {
    const m = String(e?.["doc-id"] ?? "").match(/^RFC0*(\d+)$/i);
    const id = Number(e?.errata_id);
    if (!m || !Number.isInteger(id)) continue;
    const n = Number(m[1]);
    const row = {
      id,
      status: STATUS_KEYS[e.errata_status_code] ?? String(e.errata_status_code ?? "unknown").toLowerCase(),
      type: String(e.errata_type_code ?? "").toLowerCase() || undefined,
      section: clean(e.section),
      original: clean(e.orig_text),
      corrected: clean(e.correct_text),
      notes: clean(e.notes),
      reported: typeof e.submit_date === "string" ? e.submit_date.slice(0, 10) : undefined,
    };
    row.sections = errataSections(row.section);
    if (!byRfc.has(n)) byRfc.set(n, []);
    byRfc.get(n).push(row);
  }
  for (const rows of byRfc.values()) rows.sort((a, b) => a.id - b.id);
  return byRfc;
}

const WHOLE_DOCUMENT = /\b(global|various|multiple|throughout|entire|many places|several)\b/i;

/**
 * Section ids named in an erratum's free-text section field. Page references ("pg.12",
 * "(p. 36)", "[Page 17]") are removed first so their numbers are never read as sections.
 * @returns {string[]} ids like "4.1" or "A.2", or ["GLOBAL"] for reports on the whole document
 */
export function errataSections(field) {
  if (!field) return [];
  if (WHOLE_DOCUMENT.test(field)) return ["GLOBAL"];
  let s = field
    .replace(/\[\s*page\s+[\divx]+\s*\]/gi, " ")
    .replace(/\b(?:pages?|pgs?|pp?)\.?\s*[\divx]+(?:\s*[-/]\s*[\divx]+)?/gi, " ")
    .replace(/\b(?:steps?|tables?|figures?|figs?|para(?:graph)?s?|items?|bullets?|lines?|rows?|notes?|examples?|rules?|RFC|eid)\.?\s*#?\s*\d+(?:\.\d+)*/gi, " ")
    .replace(/\bsection-/gi, "");
  const out = [];
  const add = (id) => {
    if (!out.includes(id)) out.push(id);
  };
  s = s.replace(/\bappendix\s+([A-Z])((?:\.\d+)*)\b/gi, (m, letter, rest) => {
    add(`${letter.toUpperCase()}${rest}`);
    return " ";
  });
  for (const m of s.matchAll(/(?<![\w.])([A-Z](?:\.\d+)+|\d{1,2}(?:\.\d{1,3})*)(?![\w]|\.\w)/g)) add(m[1]);
  return out;
}

/** Counts by status, always with all four keys, so zero is an explicit answer. */
export function countErrata(rows = []) {
  const counts = { verified: 0, held: 0, reported: 0, rejected: 0 };
  for (const r of rows) if (r.status in counts) counts[r.status]++;
  return counts;
}

/**
 * Whether an erratum applies to a section. With subtree, reports on any subsection count too.
 * Reports whose section field is a title ("Abstract") match a section with that title.
 */
export function errataMatches(row, sectionId, { subtree = false, title } = {}) {
  if (row.sections.includes(sectionId)) return true;
  if (subtree && row.sections.some((s) => s.startsWith(`${sectionId}.`))) return true;
  if (title) {
    const t = row.section.toLowerCase().replace(/^(?:in\s+)?(?:the\s+)?/, "").replace(/[\s.:]+$/, "");
    if (t && t === title.toLowerCase()) return true;
  }
  return false;
}
