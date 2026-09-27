// src/parse.mjs
//
// Manifest files to Kubernetes objects, each able to say which line a field is on. kubectl reads
// YAML through sigs.k8s.io/yaml, which follows YAML 1.1: `yes`, `no`, `on` and `off` are booleans
// there, so they are here too (an env value of `yes` reaches the API server as true, and is
// refused). JSON is read by the same parser. Multi-document files and List objects are split into
// their objects.
import { isMap, isScalar, LineCounter, parseAllDocuments } from "yaml";

const toIndex = (segs) => segs.map((s) => (/^\d+$/.test(s) ? Number(s) : s));

function plain(v) {
  if (Array.isArray(v)) return v.map(plain);
  if (v instanceof Date) return v.toISOString();
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x)]));
  return v;
}

/**
 * @returns {{objects: Array<{obj: object, lineOf: (segs: string[], key?: boolean) => number | undefined, line: number | undefined}>, problems: Array<{line?: number, message: string}>}}
 */
export function parseManifests(content) {
  const lineCounter = new LineCounter();
  const docs = parseAllDocuments(content, { lineCounter, version: "1.1", merge: true, prettyErrors: false, uniqueKeys: true });
  const objects = [];
  const problems = [];
  for (const doc of Array.isArray(docs) ? docs : []) {
    const e = doc.errors[0];
    if (e) {
      problems.push({ line: Array.isArray(e.pos) ? lineCounter.linePos(e.pos[0]).line : undefined, message: `not valid YAML: ${e.message.split("\n")[0].replace(/ at line \d+, column \d+:?$/, "")}` });
      continue;
    }
    if (doc.contents === null) continue;
    const lineIn = (prefix) => (segs, key) => {
      const s = toIndex([...prefix, ...segs]);
      if (key && s.length) {
        const parent = s.length > 1 ? doc.getIn(s.slice(0, -1), true) : doc.contents;
        const pair = isMap(parent) ? parent.items.find((p) => (isScalar(p.key) ? p.key.value : p.key) === s.at(-1)) : undefined;
        if (pair?.key?.range) return lineCounter.linePos(pair.key.range[0]).line;
      }
      const node = s.length ? doc.getIn(s, true) : doc.contents;
      return node?.range ? lineCounter.linePos(node.range[0]).line : undefined;
    };
    let data;
    try {
      data = plain(doc.toJS({ maxAliasCount: 1000 }));
    } catch (err) {
      problems.push({ line: doc.contents?.range ? lineCounter.linePos(doc.contents.range[0]).line : undefined, message: `not valid YAML: ${String(err.message).split("\n")[0]}` });
      continue;
    }
    // A document of comments only (Helm renders them for disabled templates) holds no object.
    if (data === null || data === undefined) continue;
    const add = (obj, prefix) => {
      const lineOf = lineIn(prefix);
      if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
        problems.push({ line: lineOf([]), message: "not a Kubernetes object: a document must be a mapping with apiVersion and kind" });
        return;
      }
      if (typeof obj.kind === "string" && /List$/.test(obj.kind) && Array.isArray(obj.items)) {
        obj.items.forEach((item, i) => add(item, [...prefix, "items", String(i)]));
        return;
      }
      if (typeof obj.apiVersion !== "string" || typeof obj.kind !== "string") {
        problems.push({ line: lineOf([]), message: `not a Kubernetes object: ${typeof obj.apiVersion !== "string" ? "apiVersion" : "kind"} is missing` });
        return;
      }
      objects.push({ obj, lineOf, line: lineOf(["kind"], true) ?? lineOf([]) });
    };
    add(data, []);
  }
  return { objects, problems };
}
