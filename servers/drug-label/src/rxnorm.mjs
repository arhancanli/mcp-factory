// src/rxnorm.mjs
//
// The RxNorm API at rxnav.nlm.nih.gov (NLM, no key). NLM asks for at most 20 requests per second
// per IP and for results to be cached 12 to 24 hours, so this server sends RxNav calls through a
// fetcher with a 12-hour cache. Only RxNorm's own content is used (names, term types, relations,
// NDC mappings and FDA pharmacologic classes); nothing from UMLS-licensed sources.
//
// NLM retired the RxNav drug-drug interaction API in January 2024. Nothing here pretends to replace
// it: interactions are read from the labels' own text elsewhere in this server.

export const RXNAV = "https://rxnav.nlm.nih.gov/REST";
const enc = encodeURIComponent;

/** The RxCUI RxNorm gives for a name (exact or normalized match), or undefined. */
export async function rxcuiByName(f, name) {
  const { data } = await f.getJson(`${RXNAV}/rxcui.json?name=${enc(name)}&search=2`);
  return data?.idGroup?.rxnormId?.[0];
}

export async function properties(f, rxcui) {
  const { data } = await f.getJson(`${RXNAV}/rxcui/${enc(rxcui)}/properties.json`);
  const p = data?.properties;
  return p ? { rxcui: p.rxcui, name: p.name, tty: p.tty } : undefined;
}

/** Related concepts by term type: { IN: [{rxcui, name}], BN: [...], ... }. */
export async function related(f, rxcui, ttys) {
  const { data } = await f.getJson(`${RXNAV}/rxcui/${enc(rxcui)}/related.json?tty=${ttys.join("+")}`);
  const out = {};
  for (const g of data?.relatedGroup?.conceptGroup ?? []) {
    out[g.tty] = (g.conceptProperties ?? []).map((c) => ({ rxcui: c.rxcui, name: c.name }));
  }
  return out;
}

export async function spellingSuggestions(f, name) {
  const { data } = await f.getJson(`${RXNAV}/spellingsuggestions.json?name=${enc(name)}`);
  return data?.suggestionGroup?.suggestionList?.suggestion ?? [];
}

/** What RxNorm knows about an NDC: its RxCUI, concept name and status (ACTIVE, OBSOLETE, ALIEN, UNKNOWN). */
export async function ndcStatus(f, ndc) {
  const { data } = await f.getJson(`${RXNAV}/ndcstatus.json?ndc=${enc(ndc)}`);
  const s = data?.ndcStatus;
  if (!s || s.status === "UNKNOWN" || !s.rxcui) return undefined;
  return { ndc11: s.ndc11, rxcui: s.rxcui, name: s.conceptName, status: s.status };
}

/**
 * FDA pharmacologic classes of one ingredient, from the FDA's own class indexing of SPLs
 * (RxClass relaSource FDASPL): mechanisms of action and established pharmacologic classes.
 */
export async function fdaClasses(f, rxcui) {
  const { data } = await f.getJson(`${RXNAV}/rxclass/class/byRxcui.json?rxcui=${enc(rxcui)}&relaSource=FDASPL&relas=has_moa+has_epc`);
  const out = new Map();
  for (const x of data?.rxclassDrugInfoList?.rxclassDrugInfo ?? []) {
    const c = x.rxclassMinConceptItem;
    if (c?.className) out.set(c.className, c.classType);
  }
  return [...out].map(([name, type]) => ({ name, type }));
}

/** Damerau-Levenshtein distance (optimal string alignment), for ranking spelling suggestions. */
export function editDistance(a, b) {
  const s = a.toLowerCase();
  const t = b.toLowerCase();
  const d = Array.from({ length: s.length + 1 }, (_, i) => [i, ...new Array(t.length).fill(0)]);
  for (let j = 1; j <= t.length; j++) d[0][j] = j;
  for (let i = 1; i <= s.length; i++) {
    for (let j = 1; j <= t.length; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && s[i - 1] === t[j - 2] && s[i - 2] === t[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[s.length][t.length];
}

/**
 * Picks a spelling correction only when it is clearly the one meant: the single closest suggestion,
 * within 2 edits (1 for names under 6 letters). Look-alike drug names are a known source of
 * medication errors, so a tie is never broken silently.
 * @returns {{name?: string, ambiguous?: string[]}}
 */
export function pickSuggestion(query, suggestions) {
  const max = query.length < 6 ? 1 : 2;
  const scored = suggestions.map((s) => ({ s, d: editDistance(query, s) })).filter((x) => x.d <= max).sort((a, b) => a.d - b.d);
  if (!scored.length) return {};
  const best = scored.filter((x) => x.d === scored[0].d);
  if (best.length > 1) return { ambiguous: best.map((x) => x.s) };
  return { name: best[0].s };
}
