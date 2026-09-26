// gate/servers.test.mjs
//
// The quality gate every server must pass before it ships. It runs against every server in
// servers/ and against a server freshly generated from the template, so the template itself is
// proven to pass. Each server directory is exactly its future standalone repository, so the gate
// also checks what that repository needs: its own repository URLs, the vendored kit and workflows,
// the Claude Desktop bundle manifest, generated README blocks, and no reach outside itself.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { CONFIG, KIT_DIR, REPO_TEMPLATE_DIR, ROOT, generateServer, gitFiles, inspectServer, kitFiles, listServerDirs, readJson, repoTemplateFiles, replaceBlock, toolListChars } from "../scripts/lib.mjs";
import { buildCatalog, renderCollection } from "../scripts/render.mjs";
import { catalogText, renderServerReadme } from "../scripts/sync.mjs";
import { mcpbManifest } from "../scripts/mcpb-manifest.mjs";
import { writeDerived } from "../scripts/new-server.mjs";
import { readPerf } from "../scripts/perf.mjs";
import { MAX_DESCRIPTION_CHARS } from "../kit/index.mjs";

const TEMPLATE_PROBE = path.join(ROOT, ".gate-tmp", "template-probe");
rmSync(TEMPLATE_PROBE, { recursive: true, force: true });
generateServer({
  name: "template-probe",
  title: "Template probe",
  description: "A server generated from the template to prove the template passes the gate.",
  summary: "Template probe.",
  category: "reference",
  host: "api.example.org",
  instructions: "Probe only.",
  outDir: TEMPLATE_PROBE,
});
await writeDerived(TEMPLATE_PROBE);

const servers = listServerDirs();
const targets = [...servers, TEMPLATE_PROBE];
const catalog = await buildCatalog(servers);
const probeCatalog = await buildCatalog(targets);
const ANNOTATIONS = ["readOnlyHint", "destructiveHint", "idempotentHint", "openWorldHint"];
const AUTHOR = CONFIG.author.name;
const OWNER = CONFIG.githubOwner;
const REQUIRED_FILES = [
  ".github/workflows/ci.yml",
  ".github/workflows/release.yml",
  ".github/workflows/canary.yml",
  ".gitignore",
  "CHANGELOG.md",
  "Dockerfile",
  "LICENSE",
  "README.md",
  "SECURITY.md",
  "glama.json",
  "mcpb/manifest.json",
  "npm-shrinkwrap.json",
  "package.json",
  "server.json",
  "src/server.mjs",
  "src/kit/index.mjs",
];

test("the gate examines every server and the template probe", () => {
  assert.ok(targets.includes(TEMPLATE_PROBE));
  assert.equal(targets.length, servers.length + 1);
});

for (const dir of targets) {
  const label = path.relative(ROOT, dir);
  const pkg = readJson(path.join(dir, "package.json"));
  const repo = `https://github.com/${OWNER}/${pkg.name}`;

  test(`${label}: package metadata names the owner and points at the server's own repository`, () => {
    assert.equal(pkg.author?.name, AUTHOR);
    assert.equal(pkg.license, "MIT");
    assert.equal(pkg.contributors, undefined, "the owner is the only contributor");
    assert.equal(pkg.type, "module");
    assert.equal(Object.values(pkg.bin ?? {})[0], "src/server.mjs");
    assert.equal(pkg.repository?.url, `git+${repo}.git`, "npm provenance requires the publishing repository");
    assert.equal(pkg.repository?.directory, undefined);
    assert.equal(pkg.homepage, `${repo}#readme`);
    assert.equal(pkg.bugs?.url, `${repo}/issues`);
    assert.equal(pkg.mcpName, `${CONFIG.mcpNamePrefix}${pkg.name}`);
    assert.ok(pkg.factory?.displayName);
    assert.ok(pkg.factory?.category in CONFIG.categories, `unknown category ${pkg.factory?.category}`);
    // An empty list is an offline server: the host scan below still refuses any URL it would call.
    assert.ok(Array.isArray(pkg.factory?.allowHosts));
    assert.ok(Number.isInteger(pkg.factory?.toolListBudget) && pkg.factory.toolListBudget > 0);
    // The SDK and zod, plus only what factory.dependencyReasons justifies in writing.
    const reasons = pkg.factory?.dependencyReasons ?? {};
    const extra = Object.keys(pkg.dependencies ?? {}).filter((d) => !["@modelcontextprotocol/sdk", "zod"].includes(d)).sort();
    assert.deepEqual(extra, Object.keys(reasons).sort(), "every dependency beyond the SDK and zod has a written reason, and every reason a dependency");
    for (const r of Object.values(reasons)) assert.ok(typeof r === "string" && r.length >= 30, "a reason says why no smaller option works");
    for (const d of ["@modelcontextprotocol/sdk", "zod"]) assert.ok(pkg.dependencies?.[d], `${d} is a dependency`);
    for (const v of Object.values(pkg.dependencies)) assert.match(v, /^\d+\.\d+\.\d+$/, "dependencies are pinned exactly");
    assert.ok(pkg.files.includes("npm-shrinkwrap.json"));

    const reg = readJson(path.join(dir, "server.json"));
    assert.equal(reg.name, pkg.mcpName);
    assert.equal(reg.version, pkg.version);
    assert.ok(reg.description.length <= 100, `server.json description is ${reg.description.length} chars; the registry allows 100`);
    assert.deepEqual(reg.repository, { url: repo, source: "github" });
    assert.equal(reg.packages[0].identifier, pkg.name);
    assert.equal(reg.packages[0].version, pkg.version);
  });

  test(`${label}: the directory holds every file its standalone repository needs`, () => {
    // The probe is generated offline, so it has no shrinkwrap (the generator writes one from npm).
    for (const f of REQUIRED_FILES) if (!(dir === TEMPLATE_PROBE && f === "npm-shrinkwrap.json")) assert.ok(existsSync(path.join(dir, f)), `missing ${f}`);
    if (dir === TEMPLATE_PROBE) return;
    const shrink = readJson(path.join(dir, "npm-shrinkwrap.json"));
    assert.equal(shrink.name, pkg.name);
    assert.deepEqual(shrink.packages[""].dependencies, pkg.dependencies, "shrinkwrap matches package.json; regenerate it");
  });

  test(`${label}: LICENSE and README credit the owner`, () => {
    assert.match(readFileSync(path.join(dir, "LICENSE"), "utf8"), new RegExp(`Copyright \\(c\\) \\d{4} ${AUTHOR}\\n`));
    assert.ok(readFileSync(path.join(dir, "README.md"), "utf8").includes(`[${AUTHOR}](`));
  });

  test(`${label}: the vendored kit and repository scaffolding are byte-identical to the factory's`, () => {
    const vendored = readdirSync(path.join(dir, "src/kit")).sort();
    assert.deepEqual(vendored, kitFiles(), "run npm run sync");
    for (const f of kitFiles()) {
      assert.equal(readFileSync(path.join(dir, "src/kit", f), "utf8"), readFileSync(path.join(KIT_DIR, f), "utf8"), `src/kit/${f} drifted; run npm run sync`);
    }
    for (const f of repoTemplateFiles()) {
      assert.equal(readFileSync(path.join(dir, f), "utf8"), readFileSync(path.join(REPO_TEMPLATE_DIR, f), "utf8"), `${f} drifted; run npm run sync`);
    }
  });

  test(`${label}: nothing reaches outside the server's own directory`, () => {
    const files = dir === TEMPLATE_PROBE ? readdirSync(dir, { recursive: true }).filter((f) => !f.includes("node_modules")) : gitFiles(dir);
    for (const f of files.filter((x) => /\.(mjs|js|json|md|yml)$/.test(x))) {
      const text = readFileSync(path.join(dir, f), "utf8");
      assert.ok(!text.includes("/Users/"), `${f} contains a local absolute path`);
      assert.ok(!/\bservers\/[a-z0-9-]+\//.test(text), `${f} refers to the factory's layout, which the standalone repository does not have`);
    }
    for (const f of files.filter((x) => /^(src|test|bench)\/.*\.mjs$/.test(x))) {
      const text = readFileSync(path.join(dir, f), "utf8");
      for (const m of text.matchAll(/(?:from\s+|import\()["'](\.[^"']+)["']/g)) {
        const target = path.resolve(path.dirname(path.join(dir, f)), m[1]);
        assert.ok(target.startsWith(dir + path.sep), `${f} imports ${m[1]}, outside the server`);
      }
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
      assert.ok(!JSON.stringify(t.outputSchema).includes('"additionalProperties":false'), `${t.name}'s output schema forbids extra fields; clients would reject results that carry them`);
    }
  });

  test(`${label}: latency and cost were measured against the live upstream`, () => {
    if (dir === TEMPLATE_PROBE) return;
    const perf = readPerf(dir);
    assert.ok(perf, "no bench/perf.json: run node scripts/perf.mjs <name> before shipping");
    assert.ok(perf.scenarios.length >= 3, "measure at least three realistic calls");
    assert.ok(perf.example?.result, "perf.json carries a real example result");
    for (const sc of perf.scenarios) assert.ok(sc.first_call_ms > 0 && sc.repeat_ms >= 0 && sc.result_chars > 0);
  });

  test(`${label}: README blocks and the bundle manifest are generated from the live server`, async () => {
    const readme = readFileSync(path.join(dir, "README.md"), "utf8");
    assert.equal(readme, await renderServerReadme(dir, dir === TEMPLATE_PROBE ? probeCatalog : catalog), "README is stale; run npm run sync");
    const manifest = readJson(path.join(dir, "mcpb/manifest.json"));
    assert.deepEqual(manifest, await mcpbManifest(dir), "mcpb/manifest.json is stale; run npm run sync");
    assert.equal(manifest.version, pkg.version);
    assert.equal(manifest.author.name, AUTHOR);
  });

  test(`${label}: every tool is named in at least one test`, async () => {
    const { tools } = await inspectServer(dir);
    const testDir = path.join(dir, "test");
    const tests = existsSync(testDir) ? readdirSync(testDir).filter((f) => f.endsWith(".test.mjs")).map((f) => readFileSync(path.join(testDir, f), "utf8")).join("\n") : "";
    for (const t of tools) assert.ok(tests.includes(`"${t.name}"`), `${t.name} has no test calling it`);
  });

  test(`${label}: every URL in the source is a declared host`, () => {
    // allowHosts: hosts the server calls (the kit refuses any other). linkHosts: hosts that only
    // appear as links in results and are never fetched.
    const linkHosts = pkg.factory.linkHosts ?? [];
    for (const h of linkHosts) assert.ok(!pkg.factory.allowHosts.includes(h), `${h} is in both allowHosts and linkHosts`);
    const srcFiles = readdirSync(path.join(dir, "src"), { recursive: true }).filter((f) => f.endsWith(".mjs") && !f.startsWith("kit"));
    for (const f of srcFiles) {
      const text = readFileSync(path.join(dir, "src", f), "utf8");
      for (const m of text.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)) {
        const host = m[1].toLowerCase();
        assert.ok(pkg.factory.allowHosts.includes(host) || linkHosts.includes(host), `src/${f} names ${m[1]}, not on factory.allowHosts or factory.linkHosts`);
      }
    }
  });

  test(`${label}: its own tests pass`, () => {
    const files = readdirSync(path.join(dir, "test")).filter((f) => f.endsWith(".test.mjs")).map((f) => path.join("test", f));
    assert.ok(files.length > 0, "a server without tests does not ship");
    // Without NODE_TEST_CONTEXT: inherited from this runner, it makes the child report to a parent
    // that is not listening, and the child exits 0 without running anything.
    const { NODE_TEST_CONTEXT, ...env } = process.env;
    const out = execFileSync(process.execPath, ["--test", "--test-reporter=tap", ...files], { cwd: dir, env, encoding: "utf8" });
    const passed = Number(out.match(/^# pass (\d+)/m)?.[1] ?? 0);
    assert.ok(passed >= files.length, `expected the server's tests to run; the reporter saw ${passed} passing`);
    assert.match(out, /^# fail 0$/m);
  });
}

test("catalog.json and the root README list every server, generated from the live servers", () => {
  assert.equal(readFileSync(path.join(ROOT, "catalog.json"), "utf8"), catalogText(catalog), "catalog.json is stale; run npm run sync");
  const readme = readFileSync(path.join(ROOT, "README.md"), "utf8");
  assert.equal(readme, replaceBlock(readme, "servers", renderCollection(catalog)), "root README is stale; run npm run sync");
  assert.equal(catalog.servers.length, servers.length);
});

test("server names are unique across the collection", () => {
  const names = catalog.servers.map((s) => s.name);
  assert.equal(new Set(names).size, names.length);
});

test("launch copy renders from measured facts, with no unfilled placeholder, and is current", async () => {
  const { facts, fill, renderProfile } = await import("../scripts/launch-kit.mjs");
  const dist = path.join(ROOT, "marketing/dist");
  for (const dir of servers) {
    const name = path.basename(dir);
    const src = path.join(ROOT, "marketing", `${name}.md`);
    if (!existsSync(src)) continue;
    const out = fill(readFileSync(src, "utf8"), await facts(dir, catalog), name);
    assert.ok(!/\{\{\w+\}\}/.test(out));
    assert.equal(readFileSync(path.join(dist, `${name}.md`), "utf8"), out, `marketing/dist/${name}.md is stale; run node scripts/launch-kit.mjs`);
  }
  assert.equal(readFileSync(path.join(dist, "profile-README.md"), "utf8"), renderProfile(catalog));
});
