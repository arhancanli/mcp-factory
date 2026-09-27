// src/validate.mjs
//
// One file: parse it, choose its schema (the one asked for, the one the file names for itself, or
// SchemaStore's match for its file name), validate every document in it, and report errors and
// warnings with lines. When several schemas claim the same file name equally (manifest.json is a
// web app manifest, a browser extension manifest or a Foxx manifest), the content decides: the
// schema the file fits best is used and the others are named.
import { compact, mapLimit, ToolError } from "./kit/index.mjs";
import { canonicalUrl, catalog, matchPath, schemaFor } from "./catalog.mjs";
import { compiled } from "./load.mjs";
import { declaredSchema, formatOf, parseConfig } from "./parse.mjs";
import { describeError, findWarnings, simplify } from "./explain.mjs";
import { matchesPattern, objectShape, rootNodes } from "./navigate.mjs";

const MAX_ERRORS = 40;
const MAX_WARNINGS = 20;
const FORMAT_NAMES = { json: "JSON", yaml: "YAML", toml: "TOML" };

function check(tree, parsed) {
  const errors = [];
  const warnings = [];
  const many = parsed.documents.length > 1;
  parsed.documents.forEach((d, i) => {
    const doc = many ? { document: i + 1 } : {};
    const raw = tree.validate(d.data) ? [] : (tree.validate.errors ?? []).slice(0, 1000);
    // "$schema" in a JSON file is an editor directive, not a setting.
    const list = simplify(tree, raw).filter((e) => !(e.instancePath === "" && e.params?.additionalProperty === "$schema"));
    const described = list.map((e) => describeError(tree, e, { lineOf: d.lineOf, format: parsed.format }));
    // "runs_on" misspelt makes "runs-on" missing too; the misspelling alone says both.
    const suggested = new Set(described.filter((x) => x.report.did_you_mean).map((x) => `${x.object}|${x.report.did_you_mean}`));
    const seen = new Set();
    for (const { report: r, object, missing } of described) {
      const k = `${r.path}|${r.message}`;
      if (seen.has(k) || (missing && suggested.has(`${object}|${missing}`))) continue;
      seen.add(k);
      errors.push({ ...doc, ...r });
    }
    const reported = new Set(errors.map((r) => r.path));
    for (const w of findWarnings(tree, d.data, { lineOf: d.lineOf }, reported)) warnings.push({ ...doc, ...w });
  });
  const order = (a, b) => (a.document ?? 0) - (b.document ?? 0) || (a.line ?? Infinity) - (b.line ?? Infinity);
  // How many top-level keys the schema does not declare: a permissive schema that accepts anything
  // must not win a tie on a file written for a stricter one.
  const shape = objectShape(rootNodes(tree));
  const top = parsed.documents[0]?.data;
  const undeclared = top && typeof top === "object" && !Array.isArray(top) ? Object.keys(top).filter((k) => !shape.known.has(k) && !matchesPattern(shape.patterns, k)).length : 0;
  return { errors: errors.sort(order), warnings: warnings.sort(order), undeclared };
}

async function candidates(ctx, path, parsed, content, schema) {
  if (schema) {
    const s = await schemaFor(ctx, schema);
    return { picks: [s] };
  }
  const c = await catalog(ctx);
  const declared = declaredSchema(parsed.format, content, parsed.documents[0]?.data);
  let note;
  if (declared && /^https?:\/\//i.test(declared)) {
    let host;
    try {
      host = new URL(declared).hostname;
    } catch {
      host = undefined;
    }
    if (host && c.hosts.has(host)) return { picks: [c.byUrl.get(canonicalUrl(declared)) ?? { name: declared, url: declared }], via: "the file's own $schema" };
    note = `The file names its schema at ${host ?? declared}, which is not a SchemaStore host; the schema for its file name was used.`;
  } else if (declared) note = `The file names a local schema (${declared.slice(0, 120)}); the schema for its file name was used.`;
  const hits = matchPath(c, path);
  if (!hits.length) return { picks: [], note };
  const top = hits.filter((h) => h.score === hits[0].score).slice(0, 3);
  return { picks: top.map((h) => h.s), note };
}

/** The report for one file. Failures that belong to the file (bad syntax, no schema) are reported in it. */
export async function checkFile(ctx, { path, content }, schema) {
  let parsed;
  try {
    parsed = parseConfig(path, content);
  } catch (err) {
    if (!(err instanceof ToolError) || err.code !== "parse_error") throw err;
    return { path, valid: false, errors: [compact({ line: err.details?.line, message: `not valid ${FORMAT_NAMES[formatOf(path, content)]}: ${err.message}` })] };
  }
  const { picks, note, via } = await candidates(ctx, path, parsed, content, schema);
  if (!picks.length) return compact({ path, errors: [], note: note ?? "SchemaStore has no schema for this file name. Pass schema (a name such as tsconfig.json, or a schema URL); find_schema searches by name." });
  const runs = await mapLimit(picks, 3, async (s) => ({ s, ...check(await compiled(ctx, s.url), parsed) }));
  runs.sort((a, b) => a.undeclared + a.errors.length - (b.undeclared + b.errors.length));
  const best = runs[0];
  const out = compact({
    path,
    schema: best.s.name,
    schema_url: best.s.url,
    chosen_by: via,
    valid: best.errors.length === 0,
    more_errors: best.errors.length > MAX_ERRORS ? best.errors.length - MAX_ERRORS : undefined,
    warnings: best.warnings.slice(0, MAX_WARNINGS),
    more_warnings: best.warnings.length > MAX_WARNINGS ? best.warnings.length - MAX_WARNINGS : undefined,
    also_matches: runs.length > 1 ? runs.slice(1).map((r) => r.s.name) : undefined,
    note,
  });
  out.errors = best.errors.slice(0, MAX_ERRORS);
  return out;
}
