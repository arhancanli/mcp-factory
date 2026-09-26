// src/drugs.mjs
//
// From whatever a user types to one FDA label:
//   name, misspelling or NDC -> RxNorm concept (rxnav.nlm.nih.gov)
//   RxNorm concept           -> DailyMed labels (dailymed.nlm.nih.gov)
//   chosen label             -> its SPL XML, parsed by spl.mjs
// and, for safety news, openFDA drug recalls (enforcement reports) and shortages (api.fda.gov).
//
// Choosing a label: a common generic has hundreds (metformin: over 500 on DailyMed, most from
// repackagers, who relabel often, so version counts do not identify the originator). Candidates come
// from openFDA's label index restricted to original packagers (manufacturers, not repackagers).
// Exact name matches rank first, then single-ingredient products for an ingredient query, then the
// originator's NDA over ANDA generics, then the longest-marketed product. The chosen label's text and version are
// read from DailyMed. Every answer names the label it used and how many others exist, and a setid
// overrides the choice.
import { ToolError } from "./kit/index.mjs";
import { fdaClasses, ndcStatus, pickSuggestion, properties, related, rxcuiByName, spellingSuggestions } from "./rxnorm.mjs";
import { DAILYMED, readSpl } from "./spl.mjs";

export const HOSTS = ["rxnav.nlm.nih.gov", "dailymed.nlm.nih.gov", "api.fda.gov"];

/** RxNav asks for at most 20 requests per second; DailyMed and openFDA (240 per minute) are kept lower. */
export const LIMITS = [
  { host: "rxnav.nlm.nih.gov", perSecond: 15, concurrency: 6 },
  { host: "dailymed.nlm.nih.gov", perSecond: 5, concurrency: 3 },
  { host: "api.fda.gov", perSecond: 3, concurrency: 2 },
];

const enc = encodeURIComponent;
export const SETID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NDC = /^\d{4,5}-\d{3,4}(-\d{1,2})?$|^\d{10,11}$/;

/**
 * Resolves a drug name, misspelling or NDC to an RxNorm concept. A misspelling is corrected only
 * when one suggestion is clearly closest: look-alike drug names cause medication errors, so a tie
 * is returned to the caller instead of guessed.
 */
export async function resolveDrug(ctx, raw) {
  const q = raw.trim();
  if (NDC.test(q)) {
    const s = await ndcStatus(ctx.fetcher, q.replace(/\D/g, "").length === 11 ? q.replace(/\D/g, "") : q);
    if (!s) throw new ToolError("ndc_not_found", `RxNorm does not know the NDC ${q}.`);
    return { rxcui: s.rxcui, name: s.name, tty: undefined, ndc: { ndc11: s.ndc11, status: s.status } };
  }
  let rxcui = await rxcuiByName(ctx.fetcher, q);
  let corrected;
  if (!rxcui) {
    const pick = pickSuggestion(q, await spellingSuggestions(ctx.fetcher, q));
    if (pick.ambiguous) throw new ToolError("ambiguous_name", `"${q}" is not a drug name RxNorm knows, and it is equally close to ${pick.ambiguous.join(" and ")}. Look-alike names are easy to confuse; ask which one is meant.`, { candidates: pick.ambiguous });
    if (!pick.name) throw new ToolError("not_found", `RxNorm has no drug named "${q}" and no close spelling.`);
    corrected = pick.name;
    rxcui = await rxcuiByName(ctx.fetcher, pick.name);
    if (!rxcui) throw new ToolError("not_found", `RxNorm has no drug named "${q}".`);
  }
  const p = await properties(ctx.fetcher, rxcui);
  return { rxcui, name: p?.name ?? q, tty: p?.tty, ...(corrected ? { corrected_from: q } : {}) };
}

export async function describeDrug(ctx, drug, { classes: withClasses = true } = {}) {
  const [rel, classes] = await Promise.all([related(ctx.fetcher, drug.rxcui, ["IN", "MIN", "BN"]), withClasses && (drug.tty === "IN" || drug.tty === "BN") ? fdaClasses(ctx.fetcher, drug.rxcui).catch(() => []) : Promise.resolve([])]);
  return {
    ingredients: [...(rel.IN ?? []), ...(rel.MIN ?? [])].map((c) => c.name),
    brands: (rel.BN ?? []).map((c) => c.name),
    classes,
  };
}

const upper = (s) => String(s ?? "").toUpperCase();
const enc2 = (q) => encodeURIComponent(q).replace(/%20/g, "+");
const single = (generic) => !/\band\b|,|\//i.test(generic ?? "");

/**
 * Original-packager labels for a concept, from openFDA's NDC directory (small records: about 2 KB
 * per product, where openFDA's label index returns whole label texts), one entry per label set id.
 */
export async function candidateLabels(ctx, rawName) {
  // Brand and generic names in one query, so the search does not wait for RxNorm to say which it is.
  const name = String(rawName).replace(/"/g, "").trim();
  const res = await ctx.fetcher.request(`https://api.fda.gov/drug/ndc.json?search=${enc2(`(brand_name:"${name}" generic_name:"${name}") AND openfda.is_original_packager:true`)}&limit=100`);
  if (res.status === 404) return { total: 0, labels: [] };
  if (!res.ok) throw new ToolError("upstream_status", `api.fda.gov answered with status ${res.status}.`);
  const d = JSON.parse(res.text);
  const bySet = new Map();
  for (const r of d.results ?? []) {
    const setid = r.openfda?.spl_set_id?.[0];
    if (!setid || bySet.has(setid)) continue;
    bySet.set(setid, { setid, brand: r.brand_name, generic: r.generic_name, manufacturer: r.labeler_name, application: r.application_number, category: r.marketing_category, form: r.dosage_form, since: r.marketing_start_date && `${r.marketing_start_date.slice(0, 4)}-${r.marketing_start_date.slice(4, 6)}-${r.marketing_start_date.slice(6, 8)}` });
  }
  const labels = [...bySet.values()];
  return { total: labels.length, products: d.meta?.results?.total ?? 0, labels };
}

/** Orders candidate labels for a query (see the file comment for the rules). */
export function rankLabels(labels, drug) {
  const q = upper(drug.name).trim();
  const score = (l) => {
    const names = [upper(l.brand), upper(l.generic)];
    let s = 0;
    if (names.some((n) => n === q || n.startsWith(`${q} `))) s += 4;
    if (drug.tty !== "BN" && single(l.generic)) s += 2;
    if (/^NDA/i.test(l.application ?? "")) s += 1;
    return s;
  };
  return [...labels].sort((a, b) => score(b) - score(a) || String(a.since).localeCompare(String(b.since)));
}

/** DailyMed's own list, used only when openFDA has no original-packager label for the concept. */
export async function dailymedLabels(ctx, drug) {
  const { data } = await ctx.fetcher.getJson(`${DAILYMED}/services/v2/spls.json?rxcui=${enc(drug.rxcui)}&pagesize=20`);
  return { total: data?.metadata?.total_elements ?? 0, labels: (data?.data ?? []).map((d) => ({ setid: d.setid, title: d.title, published: d.published_date })) };
}

export async function fetchLabel(ctx, setid) {
  const res = await ctx.labels(setid);
  if (!res) throw new ToolError("label_not_found", `DailyMed has no label with set id ${setid}.`);
  return res;
}

/**
 * Resolves the name in RxNorm and searches manufacturers' labels at the same time; the label search
 * is repeated only when RxNorm's name differs from what was typed (a correction or an NDC).
 */
export async function resolveWithCandidates(ctx, name) {
  const early = candidateLabels(ctx, name).catch(() => null);
  const resolved = await resolveDrug(ctx, name);
  const same = resolved.name.trim().toLowerCase() === name.trim().toLowerCase();
  const first = await early;
  const candidates = same && first ? first : await candidateLabels(ctx, resolved.name);
  return { resolved, candidates };
}

/** The label for a drug query or set id, with how it was chosen. */
export async function chooseLabel(ctx, { drug, setid }) {
  if (setid) {
    if (!SETID.test(setid)) throw new ToolError("bad_setid", "A set id looks like 4d4021ba-4b28-6b81-e063-6294a90a5ea7.");
    return { label: await fetchLabel(ctx, setid), chosen_by: "setid" };
  }
  if (!drug) throw new ToolError("missing_drug", "Give a drug name, an NDC, or a label setid.");
  if (SETID.test(drug.trim())) return { label: await fetchLabel(ctx, drug.trim()), chosen_by: "setid" };
  const { resolved, candidates } = await resolveWithCandidates(ctx, drug);
  let { total, labels } = candidates;
  let ranked = rankLabels(labels, resolved);
  let source = "openfda-original-packagers";
  if (!ranked.length) {
    ({ total, labels: ranked } = await dailymedLabels(ctx, resolved));
    source = "dailymed";
  }
  if (!ranked.length) throw new ToolError("no_label", `No FDA label found for ${resolved.name} (RxCUI ${resolved.rxcui}).`);
  return { label: await fetchLabel(ctx, ranked[0].setid), chosen_by: source, resolved, other_labels: total - 1, alternatives: ranked.slice(1, 4) };
}

const orTerms = (fields, names) => names.flatMap((n) => fields.map((f) => `${f}:"${n.replace(/"/g, "")}"`)).join(" ");

async function openfda(ctx, path, search, extra = "") {
  const res = await ctx.fetcher.request(`https://api.fda.gov/drug/${path}.json?search=${enc2(search)}${extra}`);
  if (res.status === 404) return { total: 0, results: [] };
  if (!res.ok) throw new ToolError("upstream_status", `api.fda.gov answered with status ${res.status}.`);
  const d = JSON.parse(res.text);
  return { total: d.meta?.results?.total ?? 0, results: d.results ?? [] };
}

/** openFDA drug recall enforcement reports, newest first; names are ORed across generic and brand. */
export const recalls = (ctx, names, limit = 10) => openfda(ctx, "enforcement", orTerms(["openfda.generic_name", "openfda.brand_name"], names), `&sort=report_date:desc&limit=${limit}`);

/** openFDA drug shortage records. */
export const shortages = (ctx, names, limit = 10) => openfda(ctx, "shortages", orTerms(["generic_name"], names), `&limit=${limit}`);

export { readSpl };
