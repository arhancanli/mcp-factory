// src/xml.mjs
//
// A small, strict-enough XML reader for FDA Structured Product Labeling documents, so the server
// needs no XML dependency. It builds a plain tree ({name, attrs, children}, text as strings),
// decodes the five XML entities and numeric character references, and ignores comments,
// processing instructions and doctype declarations. It never expands custom entities, so an
// entity-expansion document cannot blow up memory. Element names keep only their local part.

const NAMED = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

export function decodeEntities(s) {
  if (!s.includes("&")) return s;
  return s.replace(/&(#[xX][0-9a-fA-F]{1,6}|#[0-9]{1,7}|[a-zA-Z]{2,8});/g, (m, e) => {
    if (e[0] === "#") {
      const cp = e[1] === "x" || e[1] === "X" ? Number.parseInt(e.slice(2), 16) : Number.parseInt(e.slice(1), 10);
      return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : m;
    }
    return NAMED[e] ?? m;
  });
}

const TAG = /<([A-Za-z_][\w:.-]*)((?:\s+[A-Za-z_][\w:.-]*\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/y;
const ATTR = /([A-Za-z_][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
const local = (name) => name.slice(name.indexOf(":") + 1);

export class XmlError extends Error {}

/** @returns {{name: string, attrs: Record<string,string>, children: Array<object|string>}} the document element */
export function parseXml(text, { maxDepth = 256 } = {}) {
  const root = { name: "#document", attrs: {}, children: [] };
  const stack = [root];
  const top = () => stack[stack.length - 1];
  const pushText = (s) => {
    if (s) top().children.push(decodeEntities(s));
  };
  let i = 0;
  const n = text.length;
  while (i < n) {
    const lt = text.indexOf("<", i);
    if (lt === -1) {
      pushText(text.slice(i));
      break;
    }
    if (lt > i) pushText(text.slice(i, lt));
    const next = text[lt + 1];
    if (next === "!") {
      if (text.startsWith("<!--", lt)) {
        const end = text.indexOf("-->", lt + 4);
        if (end === -1) throw new XmlError("unterminated comment");
        i = end + 3;
      } else if (text.startsWith("<![CDATA[", lt)) {
        const end = text.indexOf("]]>", lt + 9);
        if (end === -1) throw new XmlError("unterminated CDATA section");
        top().children.push(text.slice(lt + 9, end));
        i = end + 3;
      } else {
        if (text.slice(lt, lt + 200).includes("[")) throw new XmlError("documents with an internal DTD subset are refused");
        const end = text.indexOf(">", lt + 2);
        if (end === -1) throw new XmlError("unterminated declaration");
        i = end + 1;
      }
      continue;
    }
    if (next === "?") {
      const end = text.indexOf("?>", lt + 2);
      if (end === -1) throw new XmlError("unterminated processing instruction");
      i = end + 2;
      continue;
    }
    if (next === "/") {
      const end = text.indexOf(">", lt + 2);
      if (end === -1) throw new XmlError("unterminated end tag");
      const name = local(text.slice(lt + 2, end).trim());
      // Lenient on mismatches: close back to the nearest open element of that name, if any.
      for (let k = stack.length - 1; k > 0; k--) {
        if (stack[k].name === name) {
          stack.length = k;
          break;
        }
      }
      i = end + 1;
      continue;
    }
    TAG.lastIndex = lt;
    const m = TAG.exec(text);
    if (!m) throw new XmlError(`malformed tag at offset ${lt}`);
    const attrs = {};
    if (m[2]) for (const a of m[2].matchAll(ATTR)) attrs[local(a[1])] = decodeEntities(a[2] ?? a[3] ?? "");
    const el = { name: local(m[1]), attrs, children: [] };
    top().children.push(el);
    if (!m[3]) {
      if (stack.length > maxDepth) throw new XmlError("document nests too deeply");
      stack.push(el);
    }
    i = TAG.lastIndex;
  }
  const doc = root.children.find((c) => typeof c !== "string");
  if (!doc) throw new XmlError("no document element");
  return doc;
}

/** Child elements with the given local name. */
export const kids = (el, name) => (el?.children ?? []).filter((c) => typeof c !== "string" && (name === undefined || c.name === name));

/** The first element reached by following child names, e.g. path(doc, "author", "assignedEntity"). */
export function path(el, ...names) {
  let cur = el;
  for (const n of names) {
    cur = (cur?.children ?? []).find((c) => typeof c !== "string" && c.name === n);
    if (!cur) return undefined;
  }
  return cur;
}

/** Every descendant element with the given name, in document order (iterative, so depth is safe). */
export function findAll(el, name) {
  const out = [];
  const todo = [...kids(el)].reverse();
  while (todo.length) {
    const cur = todo.pop();
    if (cur.name === name) out.push(cur);
    for (let k = cur.children.length - 1; k >= 0; k--) if (typeof cur.children[k] !== "string") todo.push(cur.children[k]);
  }
  return out;
}
