// src/explain.mjs
//
// Ajv's raw errors, turned into the few that matter. With allErrors, a value that fails an anyOf
// reports every branch's errors plus "must match a schema in anyOf": tsconfig's `target` alone
// gives four errors for one wrong value. Each branch error is attributed to its branch by walking
// the schema (an error belongs to branch i when the subschema that raised it is reachable from
// branch i along the error's path), then either the branch the value most nearly matched is kept,
// or, when the branches differ only in type or allowed values, one error lists what is allowed.
import { childNodes, deprecation, describe, expand, matchesPattern, nodesAt, objectShape, refChain, rootNodes, typesOf } from "./navigate.mjs";

const segsOf = (p) => (p === "" ? [] : p.slice(1).split("/").map((s) => s.replace(/~1/g, "/").replace(/~0/g, "~")));
const under = (p, prefix) => p === prefix || p.startsWith(`${prefix}/`) || prefix === "";
const LEAF = new Set(["enum", "const", "pattern", "format", "type", "false schema", "minLength", "maxLength", "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf", "anyOfValues"]);

/** A path for people: compilerOptions.target, jobs.build.steps[2].uses, services["my.app"]. */
export function displayPath(segs) {
  if (!segs.length) return "(root)";
  let out = "";
  for (const s of segs) {
    if (/^\d+$/.test(s)) out += `[${s}]`;
    else if (/^[A-Za-z_$][\w$-]*$/.test(s)) out += out ? `.${s}` : s;
    else out += `[${JSON.stringify(s)}]`;
  }
  return out;
}

// Optimal string alignment distance: edits, with a swap of neighbours counted as one.
function osa(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

const norm = (s) => s.toLowerCase().replace(/[-_\s]/g, "");

/**
 * The candidate a word was probably meant to be. `strict` is for keys the schema does not forbid
 * (only near-certain slips count); otherwise the word is known to be wrong and a looser match helps.
 */
export function nearest(word, candidates, { strict = false } = {}) {
  const w = norm(String(word));
  if (!w || w.length > 80) return undefined;
  let best;
  let bestD = Infinity;
  for (const c of candidates) {
    if (typeof c !== "string" || c === word) continue;
    const n = norm(c);
    // es2099 is not a typo of es2019: versions that differ only in digits are different values.
    if (n !== w && n.replace(/\d/g, "") === w.replace(/\d/g, "")) continue;
    if (Math.abs(n.length - w.length) > 3) continue;
    const d = n === w ? 0 : osa(w, n);
    if (d < bestD) {
      best = c;
      bestD = d;
    }
  }
  const limit = strict ? (w.length >= 10 ? 2 : w.length >= 5 ? 1 : 0) : Math.min(3, Math.max(1, Math.floor(w.length / 3)));
  if (bestD <= limit) return best;
  // "timeout" for "timeout-minutes": a known key that the word begins, when only one does.
  if (!strict && w.length >= 4) {
    const longer = candidates.filter((c) => typeof c === "string" && norm(c).startsWith(w));
    if (longer.length === 1) return longer[0];
  }
  return undefined;
}

function docIndex(tree) {
  if (tree.objDoc) return tree.objDoc;
  const m = new WeakMap();
  for (const [key, doc] of tree.docs) {
    const stack = [doc];
    while (stack.length) {
      const n = stack.pop();
      if (!n || typeof n !== "object" || m.has(n)) continue;
      m.set(n, key);
      for (const v of Object.values(n)) if (v && typeof v === "object") stack.push(v);
    }
  }
  tree.objDoc = m;
  return m;
}

function branchReach(tree, e, i, rel, memo) {
  const k = `${i}|${rel.join("/")}`;
  if (!memo.has(k)) {
    const doc = docIndex(tree).get(e.parentSchema) ?? tree.url;
    const start = expand(tree, { s: e.schema[i], doc }, { deep: true });
    memo.set(k, new Set(nodesAt(tree, start, rel, { deep: true }).map((n) => n.s)));
  }
  return memo.get(k);
}

function jsonType(v) {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  if (Number.isInteger(v)) return "integer";
  return typeof v;
}

// Replaces an anyOf/oneOf error and its branches' errors with what the value most nearly needed.
function resolveAlternatives(tree, e, out) {
  const P = segsOf(e.instancePath).length;
  const memo = new Map();
  const reaches = (x) => {
    if (!under(x.instancePath, e.instancePath)) return [];
    const rel = segsOf(x.instancePath).slice(P);
    const hits = [];
    for (let i = 0; i < e.schema.length; i++) {
      if (x.parentSchema && typeof x.parentSchema === "object" ? branchReach(tree, e, i, rel, memo).has(x.parentSchema) : x.instancePath === e.instancePath) hits.push(i);
    }
    return hits;
  };
  // The branches' errors were pushed just before this one; walk back while they belong to it.
  let start = out.length;
  const hitsOf = [];
  while (start > 0) {
    const hits = reaches(out[start - 1]);
    if (!hits.length) break;
    hitsOf.unshift(hits);
    start--;
  }
  const cands = out.splice(start);
  const groups = e.schema.map(() => []);
  let b = 0;
  cands.forEach((x, j) => {
    const i = hitsOf[j].find((h) => h >= b) ?? hitsOf[j][0];
    b = i;
    groups[i].push(x);
  });
  const mismatched = (g) => g.some((x) => x.instancePath === e.instancePath && (x.keyword === "type" || x.keyword === "false schema"));
  const live = groups.map((g, i) => ({ g, i })).filter(({ g }) => g.length && !mismatched(g));
  // A step needs "uses" or "run": every remaining branch only misses required properties here.
  if (live.length > 1 && live.every(({ g }) => g.every((x) => x.instancePath === e.instancePath && x.keyword === "required"))) {
    const sets = live.map(({ g }) => g.map((x) => x.params.missingProperty));
    out.push({ keyword: "requiredAny", instancePath: e.instancePath, parentSchema: e.parentSchema, data: e.data, params: { sets } });
    return;
  }
  const leafOnly = live.every(({ g }) => g.every((x) => x.instancePath === e.instancePath && LEAF.has(x.keyword)));
  if (!live.length || leafOnly) {
    const types = new Set();
    const values = [];
    const patterns = [];
    for (const g of groups) {
      for (const x of g) {
        if (x.instancePath !== e.instancePath) continue;
        if (x.keyword === "type") for (const t of String(x.params.type).split(",")) types.add(t);
        if (x.keyword === "enum") values.push(...x.params.allowedValues);
        if (x.keyword === "const") values.push(x.params.allowedValue);
        if (x.keyword === "anyOfValues") {
          values.push(...x.params.values);
          for (const t of x.params.types) types.add(t);
          patterns.push(...x.params.patterns);
        }
        if (x.keyword === "pattern") patterns.push(x.params.pattern);
      }
    }
    const doc = docIndex(tree).get(e.parentSchema) ?? tree.url;
    for (const { i } of live) for (const t of typesOf(expand(tree, { s: e.schema[i], doc }))) types.add(t);
    const unique = [...new Map(values.map((v) => [JSON.stringify(v), v])).values()];
    out.push({ keyword: "anyOfValues", instancePath: e.instancePath, parentSchema: e.parentSchema, data: e.data, params: { types: [...types], values: unique, patterns: [...new Set(patterns)] } });
    return;
  }
  const depth = (g) => Math.max(...g.map((x) => segsOf(x.instancePath).length));
  live.sort((x, y) => depth(y.g) - depth(x.g) || x.g.length - y.g.length || x.i - y.i);
  out.push(...live[0].g);
}

/** Ajv errors reduced to the ones worth reporting, still in Ajv's shape. */
export function simplify(tree, raw) {
  const out = [];
  // Under allErrors, Ajv reports declared properties as unevaluated once anything else in the
  // object fails (compose's depends_on beside a bad healthcheck). Only undeclared ones are kept.
  raw = raw.filter((e) => {
    if (e.keyword !== "unevaluatedProperties") return true;
    const shape = objectShape(nodesAt(tree, rootNodes(tree), segsOf(e.instancePath)));
    const k = e.params.unevaluatedProperty;
    return !shape.known.has(k) && !matchesPattern(shape.patterns, k);
  });
  for (const e of raw) {
    if (e.keyword === "if") continue;
    if (e.propertyName !== undefined && e.keyword !== "propertyNames") continue;
    if ((e.keyword === "anyOf" || e.keyword === "oneOf") && Array.isArray(e.schema) && !e.params?.passingSchemas) resolveAlternatives(tree, e, out);
    else out.push(e);
  }
  return out;
}

const show = (v) => {
  const s = JSON.stringify(v);
  return s && s.length > 60 ? `${s.slice(0, 57)}...` : String(s);
};

function valueList(values, max = 30) {
  return values.length > max ? [...values.slice(0, max), `...${values.length - max} more`] : values;
}

function firstSentence(text, max = 180) {
  const plain = String(text)
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[`*]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const m = plain.match(/^.+?[.!?](?=\s|$)/);
  const s = m ? m[0] : plain;
  return s.length > max ? `${s.slice(0, max - 3)}...` : s;
}

/** One reported error (where it is, what is wrong, what would be right), with the object it is in. */
export function describeError(tree, e, { lineOf, format }) {
  const segs = segsOf(e.instancePath);
  const nodes = () => nodesAt(tree, rootNodes(tree), segs);
  const r = { path: displayPath(segs) };
  let at = segs;
  const p = e.params ?? {};
  switch (e.keyword) {
    case "required":
      r.message = `missing required property "${p.missingProperty}"`;
      break;
    case "requiredAny":
      r.message = p.sets.every((set) => set.length === 1) ? `needs one of: ${p.sets.map(([x]) => `"${x}"`).join(", ")}` : `needs ${p.sets.map((set) => set.map((x) => `"${x}"`).join(" and ")).join(", or ")}`;
      break;
    case "additionalProperties":
    case "unevaluatedProperties": {
      const prop = p.additionalProperty ?? p.unevaluatedProperty;
      at = [...segs, prop];
      r.path = displayPath(at);
      r.message = `unknown property "${prop}"`;
      const shape = objectShape(nodes());
      const guess = nearest(prop, [...shape.known.keys()]);
      if (guess) r.did_you_mean = guess;
      else if (shape.known.size && shape.known.size <= 40) r.allowed = [...shape.known.keys()];
      break;
    }
    case "propertyNames":
      at = [...segs, p.propertyName];
      r.path = displayPath(at);
      r.message = `property name "${p.propertyName}" is not allowed${e.schema?.pattern ? ` (names must match ${e.schema.pattern})` : ""}`;
      break;
    case "false schema":
      r.message = `"${segs.at(-1) ?? "(root)"}" is not allowed here`;
      break;
    case "enum": {
      r.message = `${show(e.data)} is not an allowed value`;
      r.allowed = valueList(p.allowedValues);
      const guess = typeof e.data === "string" && nearest(e.data, p.allowedValues);
      if (guess) r.did_you_mean = guess;
      break;
    }
    case "const":
      r.message = `must be ${show(p.allowedValue)}`;
      break;
    case "anyOfValues": {
      if (p.values.length) {
        r.message = `${show(e.data)} is not an allowed value`;
        r.allowed = valueList(p.values);
        const other = p.types.filter((t) => t !== "null" && !p.values.some((v) => jsonType(v) === t || (t === "number" && typeof v === "number")));
        if (other.length) r.message += ` (${/^[aeiou]/.test(other[0]) ? "an" : "a"} ${other.join(" or ")} is also accepted)`;
        const guess = typeof e.data === "string" && nearest(e.data, p.values);
        if (guess) r.did_you_mean = guess;
      } else if (p.patterns.length && p.types.length <= 1) r.message = `${show(e.data)} does not match the required pattern ${p.patterns[0]}`;
      else r.message = `must be ${p.types.join(" or ") || "a different value"}, not ${jsonType(e.data)}`;
      break;
    }
    case "type": {
      const want = String(p.type).split(",").join(" or ");
      r.message = `must be ${want}, not ${jsonType(e.data)}`;
      // YAML reads 3.8 as a number and yes/true as a boolean; quoting keeps the text. A whole number
      // (interval: 30) usually lacks a unit instead, so it gets no hint.
      if (format === "yaml" && /string/.test(want) && (typeof e.data === "boolean" || (typeof e.data === "number" && !Number.isInteger(e.data)))) r.message += " (quote the value in YAML)";
      break;
    }
    case "pattern":
      r.message = `${show(e.data)} does not match the required pattern ${p.pattern}`;
      break;
    case "format":
      r.message = `${show(e.data)} is not a valid ${p.format}`;
      break;
    case "oneOf":
      r.message = `matches more than one of the allowed forms (${(p.passingSchemas ?? []).join(" and ")}); it must match exactly one`;
      break;
    case "dependencies":
    case "dependentRequired":
      r.message = `must have property "${p.missingProperty}" when "${p.property}" is present`;
      break;
    case "not":
      r.message = Array.isArray(e.schema?.required) ? `must not have ${e.schema.required.map((x) => `"${x}"`).join(" together with ")}` : "must not match the form the schema forbids here";
      break;
    default:
      r.message = String(e.message ?? e.keyword);
  }
  if (["const", "type", "pattern", "format"].includes(e.keyword) || (e.keyword === "anyOfValues" && !p.values.length)) {
    const d = describe(nodes());
    if (d) r.about = firstSentence(d);
  }
  const line = lineOf(at, true) ?? lineOf(segs, true);
  // For the caller: which object the error is in, and the property a "required" error misses.
  const internal = { object: e.instancePath, missing: e.keyword === "required" ? p.missingProperty : undefined };
  return { report: line ? { line, ...r } : r, ...internal };
}

// The JSON types a setting's own definition allows, when every alternative in it names its types;
// undefined when any alternative accepts values of any type.
function declaredTypes(tree, node) {
  if (!node || typeof node.s !== "object" || node.s === null) return undefined;
  const types = new Set();
  for (const { s } of expand(tree, node)) {
    const combinator = typeof s.$ref === "string" || ["allOf", "anyOf", "oneOf"].some((k) => Array.isArray(s[k]));
    if (typeof s.type === "string") types.add(s.type);
    else if (Array.isArray(s.type)) for (const t of s.type) types.add(t);
    else if (Array.isArray(s.enum)) for (const v of s.enum) types.add(jsonType(v));
    else if (Object.hasOwn(s, "const")) types.add(jsonType(s.const));
    else if (!combinator) return undefined;
  }
  if (types.has("number")) types.add("integer");
  return types.size ? [...types].filter((t) => t !== "integer" || !types.has("number")) : undefined;
}

/**
 * Settings the schema does not forbid but probably did not mean: keys a slip away from a known key
 * in objects that list their keys without saying whether others are allowed (tsconfig's
 * compilerOptions accepts "strictNullCheck" silently), and settings marked deprecated.
 */
export function findWarnings(tree, data, { lineOf }, reported) {
  const out = [];
  let budget = 20_000;
  const visit = (value, nodes, segs) => {
    if (--budget < 0 || !nodes.length || !value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach((v, i) => visit(v, childNodes(tree, nodes, String(i)), [...segs, String(i)]));
      return;
    }
    const shape = objectShape(nodes);
    for (const [k, v] of Object.entries(value)) {
      const at = [...segs, k];
      const known = shape.known.has(k) || matchesPattern(shape.patterns, k);
      if (!known && !shape.closed && !shape.openDeclared && shape.known.size && !/^(\$|x-)/.test(k) && !reported.has(displayPath(at))) {
        const guess = nearest(k, [...shape.known.keys()], { strict: true });
        if (guess) out.push({ line: lineOf(at, true), path: displayPath(at), message: `"${k}" is not a setting the schema knows; did you mean "${guess}"?`, did_you_mean: guess });
      }
      if (shape.known.has(k) && !reported.has(displayPath(at))) {
        const want = declaredTypes(tree, shape.known.get(k));
        const got = jsonType(v);
        if (want && !want.includes(got) && !(got === "integer" && want.includes("number"))) out.push({ line: lineOf(at, true), path: displayPath(at), message: `must be ${want.join(" or ")}, not ${got} (the schema's alternatives let the file pass, but this setting's own definition does not)` });
      }
      if (shape.known.has(k)) {
        const dep = deprecation(refChain(tree, shape.known.get(k)));
        if (dep) out.push({ line: lineOf(at, true), path: displayPath(at), message: `deprecated: ${firstSentence(dep, 200)}` });
      }
      visit(v, childNodes(tree, nodes, k), at);
    }
  };
  visit(data, rootNodes(tree), []);
  return out.map((w) => (w.line ? w : (({ line, ...rest }) => rest)(w)));
}
