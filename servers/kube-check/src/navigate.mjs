// src/navigate.mjs
//
// Walking a compiled schema the way a validator walks data: which subschemas apply at a path.
// Used to explain errors (which oneOf branch an error came from), to find deprecated fields, and
// to answer field_help. Shared with config-check-mcp.
//
// A node is {s, doc}: a schema object and the key of the document it sits in (local $refs resolve
// against that document).

const decodePointer = (seg) => decodeURIComponent(seg).replace(/~1/g, "/").replace(/~0/g, "~");

function findAnchor(root, name) {
  const stack = [root];
  while (stack.length) {
    const n = stack.pop();
    if (!n || typeof n !== "object") continue;
    if (n.$anchor === name || n.$id === `#${name}` || n.id === `#${name}`) return n;
    for (const [k, v] of Object.entries(n)) if (k !== "enum" && k !== "const" && k !== "default" && k !== "examples") stack.push(v);
  }
  return undefined;
}

/** The node a $ref points to, or undefined when it cannot be followed. */
export function resolveRef(tree, doc, ref) {
  const hash = ref.indexOf("#");
  const docKey = hash === 0 ? doc : hash < 0 ? ref : ref.slice(0, hash);
  const frag = hash < 0 ? "" : ref.slice(hash + 1);
  let s = tree.docs.get(docKey);
  if (s === undefined) return undefined;
  if (frag.startsWith("/")) {
    for (const seg of frag.slice(1).split("/")) {
      if (s === null || typeof s !== "object") return undefined;
      s = s[decodePointer(seg)];
    }
  } else if (frag) s = findAnchor(s, frag);
  return s === undefined ? undefined : { s, doc: docKey };
}

const APPLICATORS = ["allOf", "anyOf", "oneOf"];

/**
 * Every subschema that applies to the same value as `node`: itself, what its $ref points to, and
 * the members of allOf, anyOf, oneOf, then and else. With `deep`, also the subschemas whose errors
 * are reported at the same value (not, propertyNames, contains, dependencies).
 */
export function expand(tree, node, { deep = false } = {}, seen = new Set()) {
  const out = [];
  const visit = (n) => {
    if (!n || n.s === null || typeof n.s !== "object" || seen.has(n.s)) return;
    seen.add(n.s);
    out.push(n);
    const s = n.s;
    if (typeof s.$ref === "string") visit(resolveRef(tree, n.doc, s.$ref));
    for (const k of APPLICATORS) if (Array.isArray(s[k])) for (const b of s[k]) visit({ s: b, doc: n.doc });
    for (const k of ["then", "else"]) if (s[k]) visit({ s: s[k], doc: n.doc });
    if (deep) {
      for (const k of ["not", "propertyNames", "contains", "if"]) if (s[k]) visit({ s: s[k], doc: n.doc });
      for (const k of ["dependencies", "dependentSchemas"]) if (s[k] && typeof s[k] === "object") for (const v of Object.values(s[k])) if (!Array.isArray(v)) visit({ s: v, doc: n.doc });
    }
  };
  visit(node);
  return out;
}

const patternCache = new Map();
function patternTest(p, key) {
  let re = patternCache.get(p);
  if (re === undefined) {
    try {
      re = new RegExp(p, "u");
    } catch {
      try {
        re = new RegExp(p);
      } catch {
        re = null;
      }
    }
    if (patternCache.size > 5000) patternCache.clear();
    patternCache.set(p, re);
  }
  return re ? re.test(key) : false;
}

/** The subschemas that apply to property or index `seg` of a value the `nodes` apply to. */
export function childNodes(tree, nodes, seg, opts) {
  const out = [];
  const isIndex = /^\d+$/.test(String(seg));
  for (const { s, doc } of nodes) {
    const add = (x) => x !== undefined && out.push({ s: x, doc });
    if (isIndex && (s.items !== undefined || s.additionalItems !== undefined)) {
      if (Array.isArray(s.items)) add(Number(seg) < s.items.length ? s.items[Number(seg)] : s.additionalItems);
      else add(s.items);
      continue;
    }
    let matched = false;
    if (s.properties && Object.hasOwn(s.properties, seg)) {
      add(s.properties[seg]);
      matched = true;
    }
    for (const [p, sub] of Object.entries(s.patternProperties ?? {})) {
      if (patternTest(p, String(seg))) {
        add(sub);
        matched = true;
      }
    }
    if (!matched) {
      if (s.additionalProperties && typeof s.additionalProperties === "object") add(s.additionalProperties);
      if (s.unevaluatedProperties && typeof s.unevaluatedProperties === "object") add(s.unevaluatedProperties);
    }
  }
  const seen = new Set();
  return out.flatMap((n) => expand(tree, n, opts, seen));
}

/** The subschemas that apply to any property or item not named in the schema (a "*" in a setting path). */
export function anyChildNodes(tree, nodes) {
  const out = [];
  for (const { s, doc } of nodes) {
    for (const x of [s.additionalProperties, s.unevaluatedProperties, ...Object.values(s.patternProperties ?? {}), Array.isArray(s.items) ? undefined : s.items]) if (x && typeof x === "object") out.push({ s: x, doc });
  }
  const seen = new Set();
  return out.flatMap((n) => expand(tree, n, {}, seen));
}

/** The nodes that apply at a path (array of property names and indexes) below `nodes`. */
export function nodesAt(tree, nodes, segs, opts) {
  let cur = nodes;
  for (const seg of segs) {
    if (!cur.length) break;
    cur = childNodes(tree, cur, seg, opts);
  }
  return cur;
}

// A tree's root is a whole document, or one definition in it (a Kubernetes kind).
export const rootNodes = (tree, opts) => expand(tree, tree.root ?? { s: tree.docs.get(tree.url), doc: tree.url }, opts);

/** What the schema says about the object at these nodes: its declared keys and whether others are allowed. */
export function objectShape(nodes) {
  const known = new Map();
  const patterns = [];
  let openDeclared = false;
  let closed = false;
  for (const { s, doc } of nodes) {
    for (const [k, v] of Object.entries(s.properties ?? {})) if (!known.has(k) || !known.get(k).s) known.set(k, { s: v, doc });
    patterns.push(...Object.keys(s.patternProperties ?? {}));
    for (const k of ["additionalProperties", "unevaluatedProperties"]) {
      if (s[k] === false) closed = true;
      else if (s[k] !== undefined) openDeclared = true;
    }
  }
  return { known, patterns, openDeclared, closed };
}

/** A node and what its $ref chain points to, without descending into allOf/anyOf/oneOf. */
export function refChain(tree, node) {
  const out = [];
  let n = node;
  while (n && n.s && typeof n.s === "object" && out.length < 10 && !out.some((x) => x.s === n.s)) {
    out.push(n);
    n = typeof n.s.$ref === "string" ? resolveRef(tree, n.doc, n.s.$ref) : undefined;
  }
  return out;
}

export const matchesPattern = (patterns, key) => patterns.some((p) => patternTest(p, key));

/** The first description among the nodes, in plain text. */
export function describe(nodes) {
  for (const { s } of nodes) {
    const d = typeof s.description === "string" ? s.description : typeof s.markdownDescription === "string" ? s.markdownDescription : undefined;
    if (d) return d;
  }
  return undefined;
}

/** A deprecation notice among the nodes: deprecated: true, a deprecationMessage, or a description that opens with "Deprecated". */
export function deprecation(nodes) {
  for (const { s } of nodes) {
    if (typeof s.deprecationMessage === "string") return s.deprecationMessage;
    if (s.deprecated === true) return typeof s.description === "string" ? s.description : "Deprecated.";
    const d = typeof s.description === "string" ? s.description : s.markdownDescription;
    if (typeof d === "string" && /^\s*(\[deprecated\]|deprecated\b|\*\*deprecated\*\*)/i.test(d)) return d;
    const k8s = typeof d === "string" && d.match(/(?:^|[.\n]\s*)Deprecated:\s*([^\n]*)/);
    if (k8s) return `Deprecated: ${k8s[1]}`;
  }
  return undefined;
}

/** Allowed values collected from enum and const across the nodes (and their anyOf/oneOf branches). */
export function allowedValues(nodes) {
  const values = [];
  for (const { s } of nodes) {
    if (Array.isArray(s.enum)) values.push(...s.enum);
    if (Object.hasOwn(s, "const")) values.push(s.const);
  }
  return [...new Map(values.map((v) => [JSON.stringify(v), v])).values()];
}

export function typesOf(nodes) {
  const t = new Set();
  for (const { s } of nodes) {
    if (typeof s.type === "string") t.add(s.type);
    else if (Array.isArray(s.type)) for (const x of s.type) t.add(x);
  }
  return [...t];
}
