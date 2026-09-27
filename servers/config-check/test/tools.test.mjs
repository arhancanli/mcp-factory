// Golden tests: the three tools over a real MCP client, replaying SchemaStore's catalog and the
// schemas as recorded by test/record.mjs. No test here touches the network.
import assert from "node:assert/strict";
import test from "node:test";
import { call, connect } from "./replay.mjs";
import { CLEAN_WORKFLOW, COMPOSE, MANIFEST, PYPROJECT, TSCONFIG, WORKFLOW } from "./scenarios.mjs";

const lines = (file) => file.errors.map((e) => `${e.line} ${e.path}: ${e.message}${e.did_you_mean ? ` -> ${e.did_you_mean}` : ""}`);

test("validate_config: four kinds of config, each error with its line and the fix", async () => {
  const client = await connect();
  const files = [
    { path: "tsconfig.json", content: TSCONFIG },
    { path: ".github/workflows/ci.yml", content: WORKFLOW },
    { path: "docker-compose.yml", content: COMPOSE },
    { path: "pyproject.toml", content: PYPROJECT },
  ];
  const { data } = await call(client, "validate_config", { files });
  assert.deepEqual([data.valid, data.invalid], [0, 4]);
  const [ts, wf, compose, py] = data.files;

  assert.deepEqual([ts.schema, ts.schema_url], ["tsconfig.json", "https://www.schemastore.org/tsconfig.json"]);
  assert.deepEqual(lines(ts), ['4 compilerOptions.target: "es2099" is not an allowed value'], "one error for the value, not one per anyOf branch");
  assert.ok(ts.errors[0].allowed.includes("esnext") && !ts.errors[0].did_you_mean, "es2019 is not offered for es2099");
  assert.deepEqual(
    ts.warnings.map((w) => `${w.line} ${w.path}`),
    ["6 compilerOptions.strictNullCheck", "7 compilerOptions.outdir", "8 compilerOptions.importsNotUsedAsValues", "10 include"],
  );
  assert.deepEqual(
    ts.warnings.slice(0, 2).map((w) => w.did_you_mean),
    ["strictNullChecks", "outDir"],
    "the schema accepts unknown compilerOptions; the likely slips are still named",
  );
  assert.match(ts.warnings[2].message, /^deprecated: Deprecated in favor of verbatimModuleSyntax/);
  assert.match(ts.warnings[3].message, /^must be array or null, not string/, "include: 'src' passes the schema only through another alternative");

  assert.deepEqual(lines(wf), ['4 on.push.branch: unknown property "branch" -> branches', '8 jobs.test.runs_on: unknown property "runs_on" -> runs-on', '12 jobs.test.steps[1].timeout: unknown property "timeout" -> timeout-minutes', '17 jobs.build.steps[0]: needs one of: "uses", "run", "wait", "wait-all", "cancel", "parallel"']);

  assert.match(compose.schema_url, /compose-spec\.json$/);
  assert.deepEqual(lines(compose), ['4 services.web.port: unknown property "port" -> ports', "10 services.web.healthcheck.interval: must be string, not integer"], "depends_on and healthcheck are not reported as unknown");
  assert.match(compose.errors[1].about, /1m30s/, "the setting's description shows the expected form");

  assert.equal(py.schema, "PyProject");
  assert.deepEqual(lines(py), ['1 build-system: missing required property "requires"', "7 project.requires-python: must be string, not number", "8 project.dependencies: must be array, not string", '11 tool.ruff.line_length: unknown property "line_length" -> line-length'], "TOML lines, and ruff's own schema reached through pyproject's references");
});

test("validate_config: a clean file has no errors; a file three schemas claim is judged by the one it fits", async () => {
  const client = await connect();
  const { data } = await call(client, "validate_config", {
    files: [
      { path: ".github/workflows/test.yml", content: CLEAN_WORKFLOW },
      { path: "public/manifest.json", content: MANIFEST },
    ],
  });
  const [clean, manifest] = data.files;
  assert.deepEqual([clean.valid, clean.errors, clean.warnings], [true, [], undefined]);
  assert.equal(manifest.schema, "Web App Manifest");
  assert.deepEqual(manifest.also_matches, ["Foxx Manifest", "WebExtensions"]);
  assert.deepEqual(lines(manifest), ['1 display: "fullscreenn" is not an allowed value -> fullscreen']);
});

test("validate_config: a syntax error is the file's error, with its line", async () => {
  const client = await connect();
  const { data } = await call(client, "validate_config", { files: [{ path: "compose.yaml", content: "services:\n  web:\n    image: nginx\n   ports: [80]\n" }] });
  assert.deepEqual(data.files[0].errors, [{ line: 4, message: "not valid YAML: All mapping items must start at the same column" }]);
});

test("config_help: a setting's description, type and allowed values; search by words", async () => {
  const client = await connect();
  const { data } = await call(client, "config_help", { schema: "tsconfig.json", setting: "compilerOptions.moduleResolution" });
  assert.equal(data.setting, "compilerOptions.moduleResolution");
  assert.deepEqual(data.allowed, ["classic", "node", "node10", "node16", "nodenext", "bundler"]);
  assert.match(data.description, /^Specify the module resolution strategy/);
  const found = await call(client, "config_help", { schema: ".github/workflows/ci.yml", search: "timeout" });
  assert.equal(found.data.schema, "GitHub Workflow", "a file path picks the schema");
  assert.deepEqual(
    found.data.matches.map((m) => m.setting),
    ["jobs.*.timeout-minutes", "jobs.*.steps[].timeout-minutes"],
  );
});

test("config_help: a misspelt setting is refused with the right path", async () => {
  const client = await connect();
  const { res } = await call(client, "config_help", { schema: "docker-compose.yml", setting: "services.*.helthcheck" });
  assert.equal(res.isError, true);
  assert.match(res.content[0].text, /Did you mean services\.\*\.healthcheck\?/);
});

test("find_schema: the schema a file path gets", async () => {
  const client = await connect();
  const { data } = await call(client, "find_schema", { query: ".github/dependabot.yml" });
  assert.deepEqual([data.schemas[0].name, data.schemas[0].url, data.schemas[0].matched_by], ["dependabot-v2.json", "https://www.schemastore.org/dependabot-2.0.json", "file name"]);
});
