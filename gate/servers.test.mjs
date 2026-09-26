// gate/servers.test.mjs
//
// The quality gate every server must pass before it ships. It runs against every server in
// servers/ and against a server freshly generated from the template, so the template itself is
// proven to pass. Each check inspects the server the way a client does: the real bin over stdio.
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  CONFIG,
  KIT_DIR,
  ROOT,
  generateServer,
  inspectServer,
  kitFiles,
  listServerDirs,
  readJson,
  renderToolTable,
  toolListChars,
} from "../scripts/lib.mjs";
import { MAX_DESCRIPTION_CHARS } from "../kit/index.mjs";

const TEMPLATE_PROBE = path.join(ROOT, ".gate-tmp", "template-probe");
rmSync(TEMPLATE_PROBE, { recursive: true, force: true });
generateServer({
  name: "template-probe",
  title: "Template probe",
  description: "A server generated from the template to prove the template passes the gate.",
  host: "api.example.org",
  instructions: "Probe only.",
  outDir: TEMPLATE_PROBE,
});
// The template's README table is filled at generation time by the real generator; do the same here.
{
  const { writeReadmeTools } = await import("../scripts/new-server.mjs");
  await writeReadmeTools(TEMPLATE_PROBE);
}

const targets = [...listServerDirs(), TEMPLATE_PROBE];
const ANNOTATIONS = ["readOnlyHint", "destructiveHint", "idempotentHint", "openWorldHint"];
const AUTHOR = CONFIG.author.name;

test("the gate examines at least the template probe", () => {
  assert.ok(targets.includes(TEMPLATE_PROBE));
  assert.ok(targets.length >= 1);
});

for (const dir of targets) {
  const label = path.relative(ROOT, dir);
  const pkg = readJson(path.join(dir, "package.json"));

  test(`${label}: package metadata names the owner and agrees with the registry file`, () => {
    assert.equal(pkg.author?.name, AUTHOR);
    assert.equal(pkg.license, "MIT");
    assert.equal(pkg.contributors, undefined, "the owner is the only contributor");
    assert.equal(pkg.type, "module");
    assert.equal(Object.values(pkg.bin ?? {})[0], "src/server.mjs");
    assert.ok(pkg.mcpName?.startsWith(CONFIG.mcpNamePrefix));
    assert.ok(Array.isArray(pkg.factory?.allowHosts) && pkg.factory.allowHosts.length > 0);
    assert.ok(Number.isInteger(pkg.factory?.toolListBudget) && pkg.factory.toolListBudget > 0);
    assert.deepEqual(Object.keys(pkg.dependencies ?? {}).sort(), ["@modelcontextprotocol/sdk", "zod"]);
    for (const v of Object.values(pkg.dependencies)) assert.match(v, /^\d+\.\d+\.\d+$/, "dependencies are pinned exactly");

    const reg = readJson(path.join(dir, "server.json"));
    assert.equal(reg.name, pkg.mcpName);
    assert.equal(reg.version, pkg.version);
    assert.ok(reg.description.length <= 100, `server.json description is ${reg.description.length} chars; the registry allows 100`);
    assert.equal(reg.packages[0].identifier, pkg.name);
    assert.equal(reg.packages[0].version, pkg.version);
  });

  test(`${label}: LICENSE and README credit the owner`, () => {
    assert.match(readFileSync(path.join(dir, "LICENSE"), "utf8"), new RegExp(`Copyright \\(c\\) \\d{4} ${AUTHOR}\\n`));
    assert.ok(readFileSync(path.join(dir, "README.md"), "utf8").includes(`[${AUTHOR}](`));
  });

  test(`${label}: the vendored kit is byte-identical to the factory kit`, () => {
    const vendored = readdirSync(path.join(dir, "src/kit")).sort();
    assert.deepEqual(vendored, kitFiles(), "run npm run sync");
    for (const f of kitFiles()) {
      assert.equal(readFileSync(path.join(dir, "src/kit", f), "utf8"), readFileSync(path.join(KIT_DIR, f), "utf8"), `src/kit/${f} drifted; run npm run sync`);
    }
  });

  test(`${label}: over real stdio, the tool list follows every rule and fits the budget`, async () => {
    const first = await inspectServer(dir);
    const second = await inspectServer(dir);
    assert.equal(JSON.stringify(second.tools), JSON.stringify(first.tools), "tools/list must be byte-identical across launches so providers can cache it");
    assert.equal(first.serverInfo.name, pkg.name);
    assert.equal(first.serverInfo.version, pkg.version);
    assert.ok(first.instructions, "the server sends instructions at initialize");
    assert.ok(first.tools.length >= 1);
    const chars = toolListChars(first.tools);
    assert.ok(chars <= pkg.factory.toolListBudget, `tool list is ${chars} chars, budget ${pkg.factory.toolListBudget}`);
    for (const t of first.tools) {
      assert.ok(t.title, `${t.name} has a title`);
      assert.ok(t.description && t.description.length <= MAX_DESCRIPTION_CHARS, `${t.name} description length`);
      for (const k of ANNOTATIONS) assert.equal(typeof t.annotations?.[k], "boolean", `${t.name} annotations.${k}`);
      assert.equal(t.outputSchema?.type, "object", `${t.name} has an output schema`);
    }
  });

  test(`${label}: README tool table is generated from the live tool list`, async () => {
    const { tools } = await inspectServer(dir);
    const readme = readFileSync(path.join(dir, "README.md"), "utf8");
    assert.ok(readme.includes(`<!-- tools:start -->\n${renderToolTable(tools)}\n<!-- tools:end -->`), "run npm run sync");
  });

  test(`${label}: every tool is named in at least one test`, async () => {
    const { tools } = await inspectServer(dir);
    const testDir = path.join(dir, "test");
    const tests = existsSync(testDir) ? readdirSync(testDir).filter((f) => f.endsWith(".test.mjs")).map((f) => readFileSync(path.join(testDir, f), "utf8")).join("\n") : "";
    for (const t of tools) assert.ok(tests.includes(`"${t.name}"`), `${t.name} has no test calling it`);
  });

  test(`${label}: every URL in the source is on the allowlist`, () => {
    const srcFiles = readdirSync(path.join(dir, "src"), { recursive: true }).filter((f) => f.endsWith(".mjs") && !f.startsWith("kit"));
    for (const f of srcFiles) {
      const text = readFileSync(path.join(dir, "src", f), "utf8");
      for (const m of text.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)) {
        assert.ok(pkg.factory.allowHosts.includes(m[1].toLowerCase()), `src/${f} names ${m[1]}, not on factory.allowHosts`);
      }
    }
  });
}

for (const dir of targets) {
  test(`${path.relative(ROOT, dir)}: its own tests pass`, () => {
    const { execFileSync } = process.getBuiltinModule("node:child_process");
    const files = readdirSync(path.join(dir, "test")).filter((f) => f.endsWith(".test.mjs")).map((f) => path.join("test", f));
    assert.ok(files.length > 0, "a server without tests does not ship");
    execFileSync(process.execPath, ["--test", ...files], { cwd: dir, stdio: "pipe" });
  });
}

test("the Desktop bundle manifest lists exactly the live tools", async () => {
  const { mcpbManifest } = await import("../scripts/mcpb-manifest.mjs");
  for (const dir of targets) {
    const m = await mcpbManifest(dir);
    const { tools } = await inspectServer(dir);
    assert.deepEqual(m.tools.map((t) => t.name), tools.map((t) => t.name));
    assert.equal(m.author.name, CONFIG.author.name);
    assert.ok(m.display_name);
  }
});
