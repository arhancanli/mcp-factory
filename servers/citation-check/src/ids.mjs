// src/ids.mjs
//
// Identifiers inside a citation: DOIs (bare, doi: prefixed or as doi.org / dx.doi.org links), arXiv
// ids (new style 2303.08774v2 and old style hep-th/9901001, bare after "arXiv:" or as arxiv.org
// links) and PubMed ids (after "PMID" or as pubmed links). A lookup by identifier costs a fifth of
// a search, so every reference is mined for these first.

// DOI: 10.<registrant>/<suffix>. The suffix may contain almost anything; trailing punctuation that
// belongs to the sentence (period, comma, semicolon, closing bracket without an opener) is removed.
const DOI_RE = /\b10\.\d{4,9}\/[^\s"'<>{}]+/i;

export function cleanDoi(raw) {
  let d = String(raw ?? "").trim();
  d = d.replace(/^(?:https?:\/\/)?(?:dx\.)?doi\.org\//i, "").replace(/^doi:\s*/i, "");
  try {
    d = decodeURIComponent(d);
  } catch {}
  d = d.replace(/[.,;:]+$/, "");
  // Drop a closing bracket only when the DOI has no matching opener: 10.1016/s0140-6736(97)11096-0 keeps its ")".
  while (/[)\]]$/.test(d)) {
    const close = d.at(-1);
    const open = close === ")" ? "(" : "[";
    if (d.split(open).length > d.split(close).length - 1) break;
    d = d.slice(0, -1).replace(/[.,;:]+$/, "");
  }
  return /^10\.\d{4,9}\/\S+$/.test(d) ? d.toLowerCase() : null;
}

export function findDoi(text) {
  const m = String(text ?? "").match(DOI_RE);
  return m ? cleanDoi(m[0]) : null;
}

const ARXIV_NEW = /(?:arxiv(?:\.org\/(?:abs|pdf)\/|:\s*|\s+))?\b(\d{4}\.\d{4,5})(v\d+)?\b/i;
const ARXIV_OLD = /(?:arxiv(?:\.org\/(?:abs|pdf)\/|:\s*))((?:[a-z-]+(?:\.[A-Z]{2})?)\/\d{7})(v\d+)?/i;

/** An arXiv id without its version, only when the text says arXiv or links to it. */
export function findArxiv(text) {
  const t = String(text ?? "");
  const old = t.match(ARXIV_OLD);
  if (old) return old[1];
  if (!/arxiv/i.test(t)) return null;
  const m = t.match(ARXIV_NEW);
  return m ? m[1] : null;
}

/** The DataCite DOI arXiv registers for every paper. */
export const arxivDoi = (id) => `10.48550/arxiv.${id.toLowerCase()}`;

export function findPmid(text) {
  const t = String(text ?? "");
  const m = t.match(/\bPMID\s*:?\s*(\d{1,9})\b/i) ?? t.match(/pubmed\.ncbi\.nlm\.nih\.gov\/(\d{1,9})/i);
  return m ? m[1] : null;
}

/** Years a citation mentions (1800 to next year), in order of appearance. */
export function findYears(text, now = new Date()) {
  const max = now.getUTCFullYear() + 1;
  return [...String(text ?? "").matchAll(/(?<!\d)(1[89]\d{2}|20\d{2})(?!\d)/g)].map((m) => Number(m[1])).filter((y) => y <= max);
}
