// src/spl.mjs
//
// Turns one Structured Product Labeling (SPL) document, the XML an FDA drug label is published
// in, into what the tools answer from: who published which version when, whether the product is a
// repackaged copy of another labeler's product, and the label body as an ordered list of sections,
// each with its LOINC section code, its heading and its text as paragraphs. Lists become one
// paragraph per item and tables one paragraph per row (row-spanning cells are repeated, so a row
// read alone still names its drug class). The Highlights excerpts are skipped: every fact is read
// from the full prescribing information, never from its summary.
import { findAll, kids, parseXml, path } from "./xml.mjs";

export const DAILYMED = "https://dailymed.nlm.nih.gov/dailymed";
export const labelUrl = (setId) => `${DAILYMED}/drugInfo.cfm?setid=${encodeURIComponent(setId)}`;

// Section topics a tool can ask for, as FDA SPL section codes (LOINC). Old-format labels use
// WARNINGS and PRECAUTIONS where newer ones use WARNINGS AND PRECAUTIONS, and OTC "Drug Facts"
// labels use their own codes ("Do not use", "Ask a doctor or pharmacist"), so a topic lists all of
// them. A section nested inside another match of the same topic is not returned twice.
export const TOPICS = {
  boxed_warning: ["34066-1"],
  indications: ["34067-9", "55105-1"],
  dosage: ["34068-7"],
  contraindications: ["34070-3", "50570-1"],
  warnings: ["43685-7", "34071-1", "42232-9", "50569-3", "50567-7", "50566-9"],
  interactions: ["34073-7", "50568-5"],
  pregnancy_lactation: ["42228-7", "77290-5", "34080-2", "77291-3", "53414-9", "34079-4"],
  specific_populations: ["43684-0", "34081-0", "34082-8"],
  adverse_reactions: ["34084-4"],
  overdosage: ["34088-5"],
  description: ["34089-3", "55106-9", "51727-6"],
  how_supplied: ["34069-5", "44425-7"],
  clinical_pharmacology: ["34090-1"],
};
export const TOPIC_NAMES = Object.keys(TOPICS);

const TOPIC_OF_CODE = new Map();
for (const [topic, codes] of Object.entries(TOPICS)) for (const c of codes) if (!TOPIC_OF_CODE.has(c)) TOPIC_OF_CODE.set(c, topic);

/** Collapses layout whitespace the XML carries and the spaces it leaves before punctuation. */
export function norm(s) {
  return s
    .replace(/\s+/g, " ")
    .replace(/ ([,.;:)\]])/g, "$1")
    .replace(/([([]) /g, "$1")
    .trim();
}

export const isoDate = (v) => (/^\d{8}/.test(v ?? "") ? `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}` : undefined);

function inline(el, out) {
  for (const c of el.children) {
    if (typeof c === "string") out.push(c);
    else if (c.name === "br") out.push(" ");
    else if (c.name === "renderMultiMedia") continue;
    else if (c.name === "footnote") {
      const t = [];
      inline(c, t);
      out.push(` [${norm(t.join(""))}] `);
    } else {
      out.push(" ".repeat(c.name === "paragraph" || c.name === "item" ? 1 : 0));
      inline(c, out);
    }
  }
  return out;
}

const inlineText = (el) => (el ? norm(inline(el, []).join("")) : "");

function tableRows(table, out) {
  const caption = inlineText(path(table, "caption"));
  if (caption) out.push(caption);
  const groups = [...kids(table, "thead"), ...kids(table, "tbody"), ...kids(table, "tfoot")];
  const rows = groups.length ? groups.flatMap((g) => kids(g, "tr")) : kids(table, "tr");
  const spans = []; // per column: {text, left} for cells that span rows
  for (const tr of rows) {
    const cells = kids(tr).filter((c) => c.name === "td" || c.name === "th");
    const texts = [];
    let col = 0;
    const takeSpans = () => {
      while (spans[col]?.left > 0) {
        texts.push(spans[col].text);
        spans[col].left--;
        col++;
      }
    };
    for (const cell of cells) {
      takeSpans();
      const text = inlineText(cell);
      const rowspan = Number(cell.attrs.rowspan) || 1;
      const colspan = Math.max(1, Math.min(Number(cell.attrs.colspan) || 1, 50));
      if (rowspan > 1) spans[col] = { text, left: Math.min(rowspan, 500) - 1 };
      texts.push(text);
      col += colspan;
    }
    takeSpans();
    const row = texts.filter(Boolean).join(" | ");
    if (row) out.push(row);
  }
}

function listItems(list, out, indent) {
  const ordered = list.attrs.listType === "ordered";
  kids(list, "item").forEach((item, k) => {
    const marker = inlineText(path(item, "caption")) || (ordered ? `${k + 1}.` : "-");
    const parts = [];
    blocksOf(item, parts, new Set(["caption"]));
    if (!parts.length) return;
    out.push(`${indent}${marker} ${parts[0]}`);
    for (const p of parts.slice(1)) out.push(`${indent}  ${p}`);
  });
}

/** Paragraph-level blocks of a <text> (or <item>) element, in order. */
function blocksOf(el, out, skip = new Set()) {
  let buf = [];
  const flush = () => {
    const s = norm(buf.join(""));
    if (s) out.push(s);
    buf = [];
  };
  for (const c of el.children) {
    if (typeof c === "string") buf.push(c);
    else if (skip.has(c.name) || c.name === "renderMultiMedia") continue;
    else if (c.name === "paragraph") {
      flush();
      const s = inlineText(c);
      if (s) out.push(s);
    } else if (c.name === "list") {
      flush();
      listItems(c, out, "");
    } else if (c.name === "table") {
      flush();
      tableRows(c, out);
    } else inline(c, buf);
  }
  flush();
  return out;
}

function buildSections(section, depth, parent, nodes) {
  const code = path(section, "code")?.attrs ?? {};
  const node = { i: nodes.length, code: code.code, codeName: code.displayName, title: inlineText(path(section, "title")), depth, parent, blocks: [] };
  nodes.push(node);
  const text = path(section, "text");
  if (text) blocksOf(text, node.blocks);
  if (depth < 16) for (const comp of kids(section, "component")) for (const child of kids(comp, "section")) buildSections(child, depth + 1, node.i, nodes);
  node.end = nodes.length;
}

function products(doc) {
  const out = [];
  const seen = new Set();
  for (const p of findAll(doc, "manufacturedProduct")) {
    const name = inlineText(path(p, "name"));
    if (!name) continue;
    const generic = inlineText(path(p, "asEntityWithGeneric", "genericMedicine", "name"));
    const form = (path(p, "formCode")?.attrs.displayName ?? "").toLowerCase();
    const key = `${name}|${generic}|${form}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const same = generic && generic.toLowerCase() === name.toLowerCase();
    out.push([name, generic && !same ? `(${generic})` : "", form].filter(Boolean).join(" "));
  }
  return out;
}

/**
 * @param {string} xml  one SPL document
 * @returns the label: identity, publication, repackaging and its sections (flat, in order, each with
 *   its subtree range [i, end) so topics can take a section with everything nested inside it)
 */
export function readSpl(xml) {
  const doc = parseXml(xml);
  if (doc.name !== "document") throw new Error("not an SPL document");
  const nodes = [];
  const body = path(doc, "component", "structuredBody");
  for (const comp of kids(body, "component")) for (const s of kids(comp, "section")) buildSections(s, 0, -1, nodes);
  const source = new Set();
  for (const eq of findAll(doc, "asEquivalentEntity")) {
    const ndc = path(eq, "definingMaterialKind", "code")?.attrs.code;
    if (ndc) source.add(ndc);
  }
  const names = products(doc);
  return {
    setId: path(doc, "setId")?.attrs.root,
    version: Number(path(doc, "versionNumber")?.attrs.value) || undefined,
    effective: isoDate(path(doc, "effectiveTime")?.attrs.value),
    type: path(doc, "code")?.attrs.displayName,
    labeler: inlineText(path(doc, "author", "assignedEntity", "representedOrganization", "name")) || undefined,
    title: names[0],
    productCount: names.length,
    sourceNdcs: [...source].sort(),
    nodes,
  };
}

/** The nearest heading for a section: its own title, or its closest titled ancestor's. */
export function headingOf(label, node) {
  for (let n = node; n; n = n.parent >= 0 ? label.nodes[n.parent] : undefined) if (n.title) return n.title;
  return node.codeName ?? "";
}

/** Which topic a section belongs to: its own code's, or its closest ancestor's that has one. */
export function topicOf(label, node) {
  for (let n = node; n; n = n.parent >= 0 ? label.nodes[n.parent] : undefined) {
    const t = TOPIC_OF_CODE.get(n.code);
    if (t) return t;
  }
  return undefined;
}

/** Top sections matching a topic, without sections nested inside an earlier match. */
export function topicSections(label, topic) {
  const codes = new Set(TOPICS[topic]);
  const hits = [];
  for (const n of label.nodes) {
    if (!codes.has(n.code)) continue;
    if (hits.some((h) => n.i >= h.i && n.i < h.end)) continue;
    hits.push(n);
  }
  return hits;
}

/** Every section with text inside the given top sections (or the whole label), in order. */
export function sectionsWithin(label, tops) {
  const ranges = tops ? tops.map((t) => [t.i, t.end]) : [[0, label.nodes.length]];
  const out = [];
  for (const [a, b] of ranges) for (let k = a; k < b; k++) if (label.nodes[k].blocks.length) out.push(label.nodes[k]);
  return out;
}

/** Case-insensitive whole-word matcher for a term the user gave (letters and digits are word characters). */
export function termPattern(term) {
  const esc = term.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  return new RegExp(`(?<![A-Za-z0-9])${esc}(?![A-Za-z0-9])`, "i");
}
