// src/xml.mjs
//
// A small XML reader for the two XML sources this server reads (the RFC Editor's rfc-index.xml
// and IANA registry files). Both are plain element trees without DTD tricks, so a tokenizer that
// builds { name, attrs, children, text } nodes is enough, and it keeps the server free of parser
// dependencies. Entities are decoded; comments, processing instructions and doctypes are skipped.

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

export function decodeEntities(s) {
  if (!s.includes("&")) return s;
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === "#") {
      const cp = e[1] === "x" || e[1] === "X" ? Number.parseInt(e.slice(2), 16) : Number(e.slice(1));
      return Number.isInteger(cp) && cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : m;
    }
    return ENTITIES[e] ?? m;
  });
}

function parseAttrs(raw) {
  const attrs = {};
  for (const m of raw.matchAll(/([A-Za-z_][\w.:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[m[1]] = decodeEntities(m[2] ?? m[3]);
  return attrs;
}

const TOKEN = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[([\s\S]*?)\]\]>|<![^>]*>|<(\/?)([A-Za-z_][\w.:-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/g;

/**
 * Parses an XML document into a tree. Text is collected per element as `text` (direct text only,
 * in document order, entity-decoded). Namespace prefixes are dropped from element names.
 * @returns {{name: string, attrs: object, children: object[], text: string}} the root element
 */
export function parseXml(xml) {
  const root = { name: "#document", attrs: {}, children: [], text: "" };
  const stack = [root];
  let last = 0;
  TOKEN.lastIndex = 0;
  for (let m = TOKEN.exec(xml); m; m = TOKEN.exec(xml)) {
    const top = stack[stack.length - 1];
    if (m.index > last) top.text += decodeEntities(xml.slice(last, m.index));
    last = TOKEN.lastIndex;
    if (m[1] !== undefined) {
      top.text += m[1];
      continue;
    }
    if (m[3] === undefined) continue; // comment, processing instruction or doctype
    const name = m[3].includes(":") ? m[3].slice(m[3].indexOf(":") + 1) : m[3];
    if (m[2] === "/") {
      // Close the nearest open element with this name; tolerate stray closers.
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].name === name) {
          stack.length = i;
          break;
        }
      }
      continue;
    }
    const node = { name, attrs: m[4] ? parseAttrs(m[4]) : {}, children: [], text: "" };
    top.children.push(node);
    if (m[5] !== "/") stack.push(node);
  }
  const doc = root.children.find((c) => c.name);
  if (!doc) throw new Error("no root element");
  return doc;
}

/** The first direct child with this name, or undefined. */
export const child = (node, name) => node?.children.find((c) => c.name === name);

/** Every direct child with this name. */
export const children = (node, name) => (node ? node.children.filter((c) => c.name === name) : []);

/** Trimmed direct text of the first child with this name, or undefined when absent or empty. */
export function childText(node, name) {
  const c = child(node, name);
  const t = c ? deepText(c).trim() : "";
  return t || undefined;
}

/** All text inside a node, children included, in document order. */
export function deepText(node) {
  if (!node.children.length) return node.text;
  // Direct text and child text are stored separately, so rebuild the order approximately by
  // appending children after the node's own text; the sources this reads keep text and child
  // elements apart except in free-form notes, where the order does not carry meaning.
  return node.text + node.children.map(deepText).join("");
}
