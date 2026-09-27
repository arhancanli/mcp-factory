// src/load.mjs
//
// A schema and everything it references, fetched level by level in parallel (Ajv's own async
// loader fetches one missing reference per recompile, which took seconds for pyproject.toml's 25
// sub-schemas), normalised to one dialect and compiled once per schema URL.
//
// SchemaStore mixes drafts 04, 06, 07, 2019-09 and 2020-12, and a schema of one draft may
// reference a schema of another. Everything is compiled by one Ajv 2019-09 instance, which accepts
// draft 06 and 07 unchanged; the few constructs that differ are rewritten per document: draft-04's
// boolean exclusiveMaximum/exclusiveMinimum, and 2020-12's prefixItems.
import { createRequire } from "node:module";
import { ToolError } from "./kit/index.mjs";
import { canonicalUrl, catalog } from "./catalog.mjs";

const require = createRequire(import.meta.url);
const Ajv2019 = require("ajv/dist/2019").default;
const addFormats = require("ajv-formats").default;
const draft7 = require("ajv/dist/refs/json-schema-draft-07.json");
const draft6 = require("ajv/dist/refs/json-schema-draft-06.json");

const MAX_DOCS = 80;
const TTL = 6 * 3_600_000;
const MAX_COMPILED = 24;
// Meta-schemas Ajv already has; references to them are never fetched.
const BUILTIN = new Map([
  ["https://json-schema.org/draft-07/schema", "http://json-schema.org/draft-07/schema"],
  ["https://json-schema.org/draft-06/schema", "http://json-schema.org/draft-06/schema"],
  ["https://json-schema.org/draft/2019-09/schema", "https://json-schema.org/draft/2019-09/schema"],
]);
// Keys whose values are data, not schemas: never walked for $ref or $id.
const DATA_KEYS = new Set(["enum", "const", "default", "examples", "example"]);

function dialect(doc) {
  const s = String(doc?.$schema ?? "");
  if (/draft-0[34]/.test(s)) return "04";
  if (/2020-12/.test(s)) return "2020";
  return "07";
}

function walk(node, fn, base) {
  if (Array.isArray(node)) {
    for (const x of node) walk(x, fn, base);
    return;
  }
  if (!node || typeof node !== "object") return;
  let b = base;
  if (typeof node.$id === "string" && !node.$id.startsWith("#")) {
    try {
      b = new URL(node.$id, base).href;
    } catch {
      // an unparsable $id keeps the parent's base
    }
  }
  fn(node, b);
  for (const [k, v] of Object.entries(node)) if (!DATA_KEYS.has(k)) walk(v, fn, b);
}

function refTargets(doc, base) {
  const out = new Set();
  walk(
    doc,
    (node, b) => {
      if (typeof node.$ref !== "string" || node.$ref.startsWith("#")) return;
      try {
        out.add(canonicalUrl(new URL(node.$ref, b).href));
      } catch {
        // an unresolvable reference fails at compile time with its own message
      }
    },
    base,
  );
  return out;
}

async function fetchTree(ctx, rootUrl) {
  const { fetcher } = await catalog(ctx);
  const docs = new Map(); // key -> {doc, base}
  const alias = new Map(); // any URL a document is known by -> key
  let frontier = [canonicalUrl(rootUrl)];
  while (frontier.length) {
    if (docs.size + frontier.length > MAX_DOCS) throw new ToolError("schema_too_large", `The schema references more than ${MAX_DOCS} documents; it cannot be checked here.`);
    const got = await Promise.all(
      frontier.map(async (u) => {
        const { data } = await fetcher.getJson(u);
        if (!data || typeof data !== "object") throw new ToolError("bad_schema", `${u} is not a JSON Schema.`);
        return [u, data];
      }),
    );
    frontier = [];
    for (const [u, doc] of got) {
      const id = typeof doc.$id === "string" ? doc.$id : typeof doc.id === "string" ? doc.id : undefined;
      let idKey;
      try {
        idKey = id && canonicalUrl(new URL(id, u).href);
      } catch {
        idKey = undefined;
      }
      if (idKey && alias.has(idKey) && alias.get(idKey) !== u) {
        alias.set(u, alias.get(idKey));
        continue;
      }
      docs.set(u, { doc, base: id ? new URL(id, u).href : u });
      alias.set(u, u);
      if (idKey) alias.set(idKey, u);
    }
    for (const [u, { doc, base }] of docs) {
      if (docs.get(u).scanned) continue;
      docs.get(u).scanned = true;
      for (const t of refTargets(doc, base)) if (!alias.has(t) && !BUILTIN.has(t) && !frontier.includes(t)) frontier.push(t);
    }
  }
  return { docs, alias, root: alias.get(canonicalUrl(rootUrl)) };
}

// A deep copy with every $ref made absolute (to a document key) or local, and the other drafts'
// constructs rewritten for 2019-09.
function normalise(key, { doc, base }, alias) {
  const from = dialect(doc);
  const copy = structuredClone(doc);
  delete copy.$schema;
  delete copy.$id;
  delete copy.id;
  walk(
    copy,
    (node, b) => {
      if (typeof node.$ref === "string" && !node.$ref.startsWith("#")) {
        try {
          const abs = new URL(node.$ref, b);
          const frag = abs.hash;
          const target = canonicalUrl(abs.href);
          const k = BUILTIN.get(target) ?? alias.get(target) ?? target;
          node.$ref = k === key ? frag || "#" : `${k}${frag}`;
        } catch {
          // left as written; Ajv reports it
        }
      }
      if (from === "04") {
        for (const [ex, lim] of [
          ["exclusiveMaximum", "maximum"],
          ["exclusiveMinimum", "minimum"],
        ]) {
          if (typeof node[ex] !== "boolean") continue;
          if (node[ex] && typeof node[lim] === "number") {
            node[ex] = node[lim];
            delete node[lim];
          } else delete node[ex];
        }
      }
      if (from === "2020" && Array.isArray(node.prefixItems)) {
        const rest = node.items;
        node.items = node.prefixItems;
        delete node.prefixItems;
        if (rest !== undefined) node.additionalItems = rest;
        else delete node.additionalItems;
      }
    },
    base,
  );
  return copy;
}

function newAjv(unicodeRegExp) {
  const ajv = new Ajv2019({ strict: false, allErrors: true, verbose: true, logger: false, validateSchema: false, allowUnionTypes: true, unicodeRegExp });
  addFormats(ajv);
  ajv.addMetaSchema(draft7);
  ajv.addMetaSchema(draft6);
  return ajv;
}

async function build(ctx, url) {
  const tree = await fetchTree(ctx, url);
  const docs = new Map([...tree.docs].map(([k, v]) => [k, normalise(k, v, tree.alias)]));
  let lastErr;
  // Some schemas carry patterns that are valid JavaScript regular expressions but not valid in
  // Unicode mode; those compile on the second pass.
  for (const unicode of [true, false]) {
    try {
      const ajv = newAjv(unicode);
      for (const [k, d] of docs) ajv.addSchema(d, k);
      const validate = ajv.getSchema(tree.root);
      return { url: tree.root, docs, validate };
    } catch (err) {
      lastErr = err;
    }
  }
  throw new ToolError("schema_compile_failed", `The schema at ${url} could not be compiled: ${String(lastErr?.message ?? lastErr).slice(0, 200)}`);
}

/** The compiled schema for a URL: {url, docs: Map(key -> normalised document), validate}. */
export async function compiled(ctx, url) {
  ctx.compiled ??= new Map();
  const key = canonicalUrl(url);
  const hit = ctx.compiled.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.promise;
  const promise = build(ctx, url);
  ctx.compiled.set(key, { at: Date.now(), promise });
  promise.catch(() => ctx.compiled.delete(key));
  while (ctx.compiled.size > MAX_COMPILED) ctx.compiled.delete(ctx.compiled.keys().next().value);
  return promise;
}
