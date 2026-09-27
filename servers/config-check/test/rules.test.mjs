// Unit rules: file matching, suggestions, setting paths, parsing, dialect normalisation and the
// error explanations, against small schemas served from a fake SchemaStore. No network.
import assert from "node:assert/strict";
import test from "node:test";
import { globToRegex, matchPath } from "../src/catalog.mjs";
import { nearest } from "../src/explain.mjs";
import { declaredSchema, parseConfig } from "../src/parse.mjs";
import { createContext } from "../src/server.mjs";
import { parseSetting, showSetting } from "../src/tools/config-help.mjs";
import { checkFile } from "../src/validate.mjs";

const CATALOG = "https://www.schemastore.org/api/json/catalog.json";

function fakeStore(docs, entries) {
  const routes = { [CATALOG]: { schemas: entries }, ...docs };
  const fetchImpl = async (url) => {
    const hit = routes[String(url)];
    return hit === undefined ? new Response("not found", { status: 404 }) : new Response(JSON.stringify(hit), { status: 200 });
  };
  return createContext({ fetchImpl });
}

const check = (ctx, path, content, schema) => checkFile(ctx, { path, content }, schema);

test("fileMatch globs: ** spans folders, * stays in one, braces list options, bare names match in any folder", () => {
  const ts = globToRegex("tsconfig*.json");
  assert.ok(ts.test("tsconfig.json") && ts.test("apps/web/tsconfig.base.json"));
  assert.ok(!ts.test("tsconfig/other.json"));
  const wf = globToRegex("**/.github/workflows/*.yml");
  assert.ok(wf.test(".github/workflows/ci.yml") && wf.test("repo/.github/workflows/ci.yml"));
  assert.ok(!wf.test(".github/workflows/nested/ci.yml") && !wf.test(".github/workflows/ci.yaml"));
  assert.ok(globToRegex("{compose,docker-compose}.yml").test("deploy/compose.yml"));
  assert.ok(!globToRegex("{compose,docker-compose}.yml").test("xcompose.yml"));
});

test("matchPath: the most specific pattern wins and ties stay tied", () => {
  const c = { schemas: [{ name: "any yaml", fileMatch: ["*.yml"] }, { name: "workflow", fileMatch: ["**/.github/workflows/*.yml"] }, { name: "workflow twin", fileMatch: [".github/workflows/*.yml"] }].map((s) => ({ ...s, matchers: s.fileMatch.map(globToRegex) })) };
  const hits = matchPath(c, ".github/workflows/ci.yml");
  assert.deepEqual(
    hits.map((h) => h.s.name),
    ["workflow", "workflow twin", "any yaml"],
  );
  assert.equal(hits[0].score, hits[1].score);
});

test("nearest: slips and case are suggested; versions that differ in digits are not", () => {
  assert.equal(nearest("strictNullCheck", ["strictNullChecks", "strict"], { strict: true }), "strictNullChecks");
  assert.equal(nearest("outdir", ["outDir", "outFile"], { strict: true }), "outDir");
  assert.equal(nearest("runs_on", ["runs-on", "needs"]), "runs-on");
  assert.equal(nearest("timeout", ["timeout-minutes", "name"]), "timeout-minutes", "a key the word begins");
  assert.equal(nearest("es2099", ["es2019", "es2020", "esnext"]), undefined);
  assert.equal(nearest("dayly", ["daily", "weekly"]), "daily");
  assert.equal(nearest("lint", ["list", "line"], { strict: true }), undefined, "four letters or fewer need a case-only difference when the schema does not forbid the key");
  assert.equal(nearest("LINT", ["lint"], { strict: true }), "lint");
  assert.equal(nearest("color", ["colour"], { strict: true }), "colour");
});

test("setting paths: dots, wildcards, array items, quoted keys and JSON pointers", () => {
  assert.deepEqual(parseSetting("jobs.*.steps[].uses"), ["jobs", "*", "steps", "[]", "uses"]);
  assert.deepEqual(parseSetting('services["my.app"].ports[0]'), ["services", "my.app", "ports", "0"]);
  assert.deepEqual(parseSetting("/compilerOptions/a~1b"), ["compilerOptions", "a/b"]);
  assert.deepEqual(parseSetting(""), []);
  assert.equal(showSetting(["jobs", "*", "steps", "[]", "uses"]), "jobs.*.steps[].uses");
  assert.equal(showSetting(["services", "my.app"]), 'services["my.app"]');
});

test("parsing: JSON with comments, YAML documents and TOML tables all report lines", () => {
  const j = parseConfig("tsconfig.json", '{\n  // comment\n  "a": { "b": 1, },\n}\n');
  assert.deepEqual(j.documents[0].data, { a: { b: 1 } });
  assert.equal(Object.getPrototypeOf(j.documents[0].data), Object.prototype, "ordinary objects, not jsonc-parser's prototype-less ones");
  assert.equal(j.documents[0].lineOf(["a", "b"], true), 3);
  const y = parseConfig("k8s.yaml", "a: 1\n---\nkind: Pod\nspec:\n  x: 2\n");
  assert.equal(y.documents.length, 2);
  assert.equal(y.documents[1].lineOf(["spec", "x"], true), 5);
  const t = parseConfig("Cargo.toml", '[package]\nname = "x"\n\n[[bin]]\nname = "a"\n\n[[bin]]\nname = "b"\nd = 1979-05-27\n');
  assert.equal(t.documents[0].lineOf(["bin", "1", "name"]), 8);
  assert.equal(t.documents[0].data.bin[1].d, "1979-05-27", "TOML dates are compared as their text");
  const merged = parseConfig("compose.yaml", "x-base: &base\n  image: nginx\nservices:\n  web:\n    <<: *base\n    ports: [80]\n");
  assert.equal(merged.documents[0].data.services.web.image, "nginx", "merge keys, as Compose files use them");
  assert.throws(() => parseConfig("a.yaml", "a:\n  b: 1\n c: 2\n"), (e) => e.code === "parse_error" && e.details.line === 3);
});

test("a file's own schema: JSON $schema, the yaml-language-server comment, Taplo's #:schema", () => {
  assert.equal(declaredSchema("json", "", { $schema: "https://x/s.json" }), "https://x/s.json");
  assert.equal(declaredSchema("yaml", "# yaml-language-server: $schema=https://x/y.json\na: 1\n"), "https://x/y.json");
  assert.equal(declaredSchema("toml", "#:schema https://x/t.json\na = 1\n"), "https://x/t.json");
});

const S = "https://www.schemastore.org";

test("drafts are normalised: draft-04 exclusiveMaximum, 2020-12 prefixItems, refs across documents and hosts", async () => {
  const docs = {
    [`${S}/root.json`]: { $schema: "http://json-schema.org/draft-07/schema#", $id: "https://json.schemastore.org/root.json", type: "object", properties: { old: { $ref: "old.json" }, pair: { $ref: "https://json.schemastore.org/new.json#/$defs/pair" } } },
    [`${S}/old.json`]: { $schema: "http://json-schema.org/draft-04/schema#", id: "https://json.schemastore.org/old.json", type: "number", maximum: 10, exclusiveMaximum: true },
    [`${S}/new.json`]: { $schema: "https://json-schema.org/draft/2020-12/schema", $defs: { pair: { type: "array", prefixItems: [{ type: "string" }, { type: "integer" }], items: false } } },
  };
  const ctx = fakeStore(docs, [{ name: "root", url: `${S}/root.json`, fileMatch: ["root.json"] }]);
  const r = await check(ctx, "root.json", JSON.stringify({ old: 10, pair: ["a", "b", "c"] }));
  const messages = r.errors.map((e) => `${e.path}: ${e.message}`);
  assert.ok(messages.includes("old: must be < 10"), messages.join(" | "));
  assert.ok(messages.includes("pair[1]: must be integer, not string"), messages.join(" | "));
  assert.ok(messages.some((m) => m.startsWith("pair: ")), "the third item is refused: items: false after prefixItems");
  assert.equal((await check(ctx, "root.json", JSON.stringify({ old: 9.5, pair: ["a", 1] }))).valid, true);
});

const errorsOf = async (schema, data, path = "c.json") => {
  const ctx = fakeStore({ [`${S}/c.json`]: schema }, [{ name: "c", url: `${S}/c.json`, fileMatch: ["c.json", "c.yml"] }]);
  return check(ctx, path, path.endsWith(".json") ? JSON.stringify(data, null, 2) : data);
};

test("alternatives: one error listing the allowed values instead of one per branch", async () => {
  const r = await errorsOf({ type: "object", properties: { target: { anyOf: [{ enum: ["es5", "es2020"] }, { type: "string", pattern: "^[Ee][Ss]\\d+$" }, { type: "null" }] } } }, { target: "es2099x" });
  assert.deepEqual(r.errors, [{ line: 2, path: "target", message: '"es2099x" is not an allowed value', allowed: ["es5", "es2020"] }]);
});

test("alternatives: the branch the value nearly matched is reported, not the others", async () => {
  const r = await errorsOf({ type: "object", properties: { repo: { anyOf: [{ type: "string" }, { type: "object", properties: { url: { type: "string" } }, required: ["type"] }] } } }, { repo: { url: 5 } });
  assert.deepEqual(
    r.errors.map((e) => `${e.path}: ${e.message}`),
    ['repo: missing required property "type"', "repo.url: must be string, not integer"],
  );
});

test("alternatives: of two object forms, the one the value went further into is reported", async () => {
  const r = await errorsOf({ type: "object", properties: { repo: { anyOf: [{ type: "object", required: ["a", "b"] }, { type: "object", properties: { url: { type: "string" } } }] } } }, { repo: { url: 5 } });
  assert.deepEqual(
    r.errors.map((e) => `${e.path}: ${e.message}`),
    ["repo.url: must be string, not integer"],
  );
});

test("alternatives that differ only in a required key become 'needs one of'", async () => {
  const r = await errorsOf({ type: "object", properties: { step: { anyOf: [{ required: ["uses"] }, { required: ["run"] }] } } }, { step: { name: "x" } });
  assert.equal(r.errors[0].message, 'needs one of: "uses", "run"');
});

test("a misspelt key: one error with the suggestion, not also 'missing required'", async () => {
  const r = await errorsOf({ type: "object", required: ["runs-on"], properties: { "runs-on": { type: "string" }, steps: {} }, additionalProperties: false }, { runs_on: "x" });
  assert.deepEqual(r.errors, [{ line: 2, path: "runs_on", message: 'unknown property "runs_on"', did_you_mean: "runs-on" }]);
});

test("unevaluatedProperties: declared keys are not reported when another key fails (Ajv under allErrors)", async () => {
  const schema = { type: "object", properties: { a: { type: "object", properties: { n: { type: "string" } } }, b: { oneOf: [{ type: "array" }, { type: "object" }] } }, unevaluatedProperties: false };
  const r = await errorsOf(schema, { a: { n: 1 }, b: [], typo: 1 });
  assert.deepEqual(
    r.errors.map((e) => e.path),
    ["a.n", "typo"],
  );
});

test("warnings: misspelt keys where the schema is silent, none where it invites other keys, and deprecations", async () => {
  const schema = {
    type: "object",
    properties: {
      compilerOptions: { type: "object", properties: { strictNullChecks: { type: "boolean" }, importsNotUsedAsValues: { description: "Deprecated in favor of verbatimModuleSyntax." } } },
      scripts: { type: "object", properties: { test: { type: "string" } }, additionalProperties: { type: "string" } },
    },
    // tsconfig's shape: "include" is defined only inside one alternative, and another alternative
    // (no "files" key) passes, so the schema as a whole never looks at include.
    anyOf: [{ properties: { files: { type: "array" } } }, { properties: { include: { anyOf: [{ type: "array" }, { type: "null" }] } } }],
  };
  const r = await errorsOf(schema, { compilerOptions: { strictNullCheck: true, importsNotUsedAsValues: "remove" }, scripts: { tests: "x" }, include: "src" });
  assert.equal(r.valid, true);
  assert.deepEqual(
    r.warnings.map((w) => w.path),
    ["compilerOptions.strictNullCheck", "compilerOptions.importsNotUsedAsValues", "include"],
    "scripts.tests is not flagged: scripts accepts other keys",
  );
  assert.equal(r.warnings[0].did_you_mean, "strictNullChecks");
  assert.equal(r.warnings[1].message, "deprecated: Deprecated in favor of verbatimModuleSyntax.");
  assert.match(r.warnings[2].message, /^must be array or null, not string \(the schema's alternatives let the file pass/);
});

test("YAML values: numbers where text is wanted get the quoting hint only when quoting is the fix", async () => {
  const schema = { type: "object", properties: { version: { type: "string" }, interval: { type: "string" }, flag: { type: "string" } } };
  // YAML 1.2, as GitHub and Compose read it: "yes" is text, true is a boolean.
  const r = await errorsOf(schema, "version: 3.8\ninterval: 30\nflag: true\nother: yes\n", "c.yml");
  assert.deepEqual(
    r.errors.map((e) => e.message),
    ["must be string, not number (quote the value in YAML)", "must be string, not integer", "must be string, not boolean (quote the value in YAML)"],
  );
});

test("ties: the schema that declares the file's keys wins over one that accepts anything", async () => {
  const docs = {
    [`${S}/open.json`]: { type: "object" },
    [`${S}/app.json`]: { type: "object", properties: { display: { enum: ["fullscreen", "standalone"] }, start_url: { type: "string" } } },
  };
  const ctx = fakeStore(docs, [
    { name: "Open", url: `${S}/open.json`, fileMatch: ["manifest.json"] },
    { name: "App", url: `${S}/app.json`, fileMatch: ["manifest.json"] },
  ]);
  const r = await check(ctx, "manifest.json", '{"display": "fullscreenn", "start_url": "/"}');
  assert.equal(r.schema, "App");
  assert.deepEqual(r.also_matches, ["Open"]);
  assert.equal(r.errors[0].did_you_mean, "fullscreen");
});

test("schemas are only fetched from hosts SchemaStore's catalog uses", async () => {
  const ctx = fakeStore({}, [{ name: "c", url: `${S}/c.json`, fileMatch: ["c.json"] }]);
  await assert.rejects(check(ctx, "c.json", "{}", "https://evil.example/s.json"), (e) => e.code === "schema_host_not_allowed");
  const own = await check(ctx, "other.json", '{"$schema": "https://evil.example/s.json"}');
  assert.match(own.note, /not a SchemaStore host/);
});
