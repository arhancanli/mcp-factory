// src/parse.mjs
//
// Config files to data, keeping where each value sits so errors can name a line: JSON with
// comments and trailing commas (jsonc-parser), YAML with every document of a multi-document file
// (yaml, with a line counter, merge keys on as Compose and GitLab use them) and TOML (smol-toml;
// lines are found by reading the table headers and keys).
import { findNodeAtLocation, getNodeValue, parseTree, printParseErrorCode } from "jsonc-parser";
import { parse as parseToml } from "smol-toml";
import { isMap, isScalar, LineCounter, parseAllDocuments } from "yaml";
import { ToolError } from "./kit/index.mjs";

export function formatOf(path, content) {
  const p = String(path).toLowerCase();
  if (/\.(ya?ml)$/.test(p)) return "yaml";
  if (/\.toml$/.test(p)) return "toml";
  if (/\.(json|jsonc)$/.test(p) || /(^|\/)\.[\w-]*rc$/.test(p)) return "json";
  return /^\s*[{[]/.test(content) ? "json" : "yaml";
}

// Ordinary objects and strings only: jsonc-parser builds objects without a prototype (Ajv's
// uniqueItems comparison calls valueOf on them and throws), and TOML dates arrive as Date objects
// where a schema expects the date's text.
export function plain(v) {
  if (Array.isArray(v)) return v.map(plain);
  if (v instanceof Date) return typeof v.toISOString === "function" ? v.toISOString() : String(v);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x)]));
  return v;
}

const lineAt = (text, offset) => text.slice(0, offset).split("\n").length;
const toIndex = (segs) => segs.map((s) => (/^\d+$/.test(s) ? Number(s) : s));

function parseJson(path, content) {
  const errors = [];
  const root = parseTree(content, errors, { allowTrailingComma: true, disallowComments: false });
  if (errors.length || !root) {
    const e = errors[0];
    // "ColonExpected" reads as "colon expected".
    const what = e ? printParseErrorCode(e.error).replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase() : "the file is empty or not JSON";
    throw new ToolError("parse_error", what, { line: e ? lineAt(content, e.offset) : 1 });
  }
  const lineOf = (segs, key) => {
    const node = findNodeAtLocation(root, toIndex(segs));
    if (!node) return undefined;
    return lineAt(content, key && node.parent?.type === "property" ? node.parent.offset : node.offset);
  };
  return [{ data: plain(getNodeValue(root)), lineOf }];
}

function parseYaml(path, content) {
  const lineCounter = new LineCounter();
  const docs = parseAllDocuments(content, { lineCounter, merge: true, prettyErrors: false });
  const list = Array.isArray(docs) ? docs : [];
  for (const doc of list) {
    const e = doc.errors[0];
    if (e) {
      const line = e.linePos?.[0]?.line ?? (Array.isArray(e.pos) ? lineCounter.linePos(e.pos[0]).line : undefined);
      throw new ToolError("parse_error", e.message.split("\n")[0].replace(/ at line \d+, column \d+:?$/, ""), { line });
    }
  }
  const out = list
    .filter((doc) => doc.contents !== null || list.length === 1)
    .map((doc) => ({
      data: plain(doc.toJS({ maxAliasCount: 1000 }) ?? null),
      lineOf: (segs, key) => {
        const s = toIndex(segs);
        if (key && s.length) {
          const parent = s.length > 1 ? doc.getIn(s.slice(0, -1), true) : doc.contents;
          const pair = isMap(parent) ? parent.items.find((p) => (isScalar(p.key) ? p.key.value : p.key) === s.at(-1)) : undefined;
          if (pair?.key?.range) return lineCounter.linePos(pair.key.range[0]).line;
        }
        const node = s.length ? doc.getIn(s, true) : doc.contents;
        return node?.range ? lineCounter.linePos(node.range[0]).line : undefined;
      },
    }));
  return out.length ? out : [{ data: null, lineOf: () => undefined }];
}

// "a.b" and 'a."b.c"' as key segments.
function splitKey(text) {
  const out = [];
  const re = /\s*(?:"((?:[^"\\]|\\.)*)"|'([^']*)'|([A-Za-z0-9_-]+))\s*(?:\.|$)/gy;
  let m;
  while (re.lastIndex < text.length && (m = re.exec(text))) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}

function tomlLines(content) {
  const entries = [];
  const counts = new Map();
  let table = [];
  let inString = false;
  content.split("\n").forEach((raw, i) => {
    const line = raw.trim();
    const quotes = (raw.match(/"""|'''/g) ?? []).length;
    if (inString) {
      if (quotes % 2 === 1) inString = false;
      return;
    }
    let m;
    if ((m = line.match(/^\[\[\s*(.+?)\s*\]\]/))) {
      const base = splitKey(m[1]);
      const k = base.join("\u0000");
      const n = counts.get(k) ?? 0;
      counts.set(k, n + 1);
      table = [...base, String(n)];
      entries.push({ path: table, line: i + 1 });
    } else if ((m = line.match(/^\[\s*(.+?)\s*\]/))) {
      table = splitKey(m[1]);
      entries.push({ path: table, line: i + 1 });
    } else if ((m = line.match(/^((?:"(?:[^"\\]|\\.)*"|'[^']*'|[A-Za-z0-9_-]+)(?:\s*\.\s*(?:"(?:[^"\\]|\\.)*"|'[^']*'|[A-Za-z0-9_-]+))*)\s*=/))) {
      entries.push({ path: [...table, ...splitKey(m[1])], line: i + 1 });
    }
    if (quotes % 2 === 1) inString = true;
  });
  return (segs) => {
    let best;
    for (const e of entries) {
      if (e.path.length > segs.length || !e.path.every((s, j) => s === segs[j])) continue;
      if (!best || e.path.length > best.path.length) best = e;
    }
    return best?.line;
  };
}

function parseTomlFile(path, content) {
  try {
    return [{ data: plain(parseToml(content)), lineOf: tomlLines(content) }];
  } catch (err) {
    throw new ToolError("parse_error", String(err.message).split("\n")[0], { line: err.line });
  }
}

/**
 * @returns {{format: string, documents: Array<{data: unknown, lineOf: (segs: string[], key?: boolean) => number | undefined}>}}
 */
export function parseConfig(path, content) {
  const format = formatOf(path, content);
  const documents = format === "json" ? parseJson(path, content) : format === "yaml" ? parseYaml(path, content) : parseTomlFile(path, content);
  return { format, documents };
}

/** A schema the file names for itself: "$schema" in JSON, a yaml-language-server comment, a Taplo "#:schema" line. */
export function declaredSchema(format, content, data) {
  if (format === "json" && data && typeof data === "object" && typeof data.$schema === "string") return data.$schema;
  if (format === "yaml") return content.match(/^\s*#\s*yaml-language-server:\s*\$schema=(\S+)/m)?.[1];
  if (format === "toml") return content.match(/^\s*#:schema\s+(\S+)/m)?.[1];
  return undefined;
}
