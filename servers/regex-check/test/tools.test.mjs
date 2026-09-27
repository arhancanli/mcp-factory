// Golden tests: both tools over a real MCP client, on the real engines (V8, CPython via Pyodide,
// PCRE2 and RE2 in WebAssembly). Offline.
import assert from "node:assert/strict";
import test from "node:test";
import { stopEngines } from "../src/engines.mjs";
import { call, connect } from "./harness.mjs";

const { client, ctx } = await connect({ timeoutMs: 2500 });
test.after(() => stopEngines(ctx));
const by = (data) => Object.fromEntries(data.engines.map((e) => [e.flavor, e]));
const hits = (e, i) => e.results[i].matches.map((m) => [m.index, m.text, m.groups]);

test("test_regex: each engine's own answer to Python-style groups, Unicode digits and replacement syntax", async () => {
  const { data } = await call(client, "test_regex", { pattern: "(?P<year>\\d{4})-(\\d{2})", inputs: ["on 2026-09", "٢٠٢٦-٠٩ and 1999-12"], replacement: "\\2/\\1" });
  const e = by(data);
  assert.match(e.javascript.engine, /^V8 /);
  assert.match(e.python.engine, /^CPython 3\.\d+\.\d+ re \(Pyodide\)$/);
  assert.equal(e.javascript.error.message, "Invalid group", "JavaScript has no (?P<name>) syntax");
  assert.deepEqual(hits(e.python, 1), [[0, "٢٠٢٦-٠٩", ["٢٠٢٦", "٠٩"]], [12, "1999-12", ["1999", "12"]]], "Python's \\d matches Arabic-Indic digits");
  assert.deepEqual(hits(e.pcre, 1), [[12, "1999-12", ["1999", "12"]]]);
  assert.deepEqual(hits(e.re2, 1), [[12, "1999-12", ["1999", "12"]]]);
  assert.deepEqual(e.python.results[0].matches[0].named, { year: "2026" });
  assert.equal(e.python.results[0].replaced, "on 09/2026");
  assert.equal(e.pcre.results[0].replaced, "on 09/2026");
  assert.equal(e.re2.results[0].replaced, "on \\2/\\1", "RE2 here takes $1, as JavaScript and Go do");
  assert.equal(data.agree, false);
  assert.deepEqual(data.differences.slice(0, 2), ["compiles in python, pcre, re2; refused by javascript (Invalid group)", 'input 1 replaced: python, pcre: "on 09/2026"; re2: "on \\\\2/\\\\1"']);
  assert.match(data.differences[2], /^input 2: python: 2 matches/);
});

test("test_regex: positions are characters; lookbehind refused by RE2 with its own message", async () => {
  const { data } = await call(client, "test_regex", { pattern: "(?<=\\$)\\d+(?:\\.\\d\\d)?", inputs: ["\u{1F600} $12.50 and $3"] });
  const e = by(data);
  for (const f of ["javascript", "python", "pcre"]) assert.deepEqual(hits(e[f], 0), [[3, "12.50", []], [14, "3", []]], f);
  assert.equal(e.re2.error.message, "invalid perl operator: (?<");
  assert.deepEqual(data.differences, ["compiles in javascript, python, pcre; refused by re2 (invalid perl operator: (?<)"]);
});

test("test_regex: flags each engine has or lacks, and unmatched groups as null", async () => {
  const { data } = await call(client, "test_regex", { pattern: "a (b)? # comment\n c", flags: "x", inputs: ["ac"], flavors: ["javascript", "python", "pcre", "re2"] });
  const e = by(data);
  assert.match(e.javascript.error.message, /no x flag/);
  assert.match(e.re2.error.message, /no x flag/);
  assert.deepEqual(hits(e.python, 0), [[0, "ac", [null]]]);
  assert.deepEqual(hits(e.pcre, 0), [[0, "ac", [null]]]);
});

test("test_regex: empty matches advance, as each engine's own find-all does", async () => {
  const { data } = await call(client, "test_regex", { pattern: "a*", inputs: ["baac"] });
  for (const e of data.engines) assert.deepEqual(hits(e, 0), [[0, "", []], [1, "aa", []], [3, "", []], [4, "", []]], e.flavor);
});

test("test_regex: an input that backtracks forever stops that engine only", async () => {
  await call(client, "test_regex", { pattern: "b", inputs: ["b"], flavors: ["javascript"] });
  const stuck = ctx.engines.javascript.worker;
  const exited = new Promise((done) => stuck.once("exit", () => done(true)));
  const { data } = await call(client, "test_regex", { pattern: "^(\\w+\\s?)+$", inputs: ["aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa!"], flavors: ["javascript", "re2"] });
  assert.equal(await Promise.race([exited, new Promise((done) => setTimeout(() => done(false), 3000))]), true, "the stuck thread is ended");
  const e = by(data);
  assert.match(e.javascript.timed_out, /^did not finish within 2\.5 s/);
  assert.deepEqual(e.re2.results[0].match_count, 0);
  const again = await call(client, "test_regex", { pattern: "b", inputs: ["abc"], flavors: ["javascript"] });
  assert.deepEqual(hits(by(again.data).javascript, 0), [[1, "b", []]], "the stuck engine was replaced");
});

test("check_redos: exponential backtracking, the part to blame, and what each engine did", async () => {
  const { data } = await call(client, "check_redos", { pattern: "^(a+)+$" });
  assert.deepEqual([data.status, data.complexity, data.hotspot], ["vulnerable", "exponential", "^(«a»+)+$"]);
  assert.equal(data.attack.expression, "'a' + 'a'.repeat(31) + '\\x00'");
  const m = Object.fromEntries(data.measured_on_attack.map((x) => [x.flavor, x.result]));
  assert.equal(m.javascript, "stopped after 2 s without finishing");
  assert.equal(m.python, "stopped after 2 s without finishing");
  assert.match(m.re2, /^\d+(\.\d+)? ms$/);
  assert.deepEqual(data.hangs_on, ["javascript", "python"]);
});

test("check_redos: a safe pattern, a polynomial one, and Python-only syntax analysed", async () => {
  const safe = await call(client, "check_redos", { pattern: "^[\\w.+-]+@[\\w-]+\\.[\\w.]+$", verify: false });
  assert.deepEqual([safe.data.status, safe.data.complexity], ["safe", "linear"]);
  const poly = await call(client, "check_redos", { pattern: "\\s*#\\s*$", verify: false });
  assert.deepEqual([poly.data.status, poly.data.complexity], ["vulnerable", "2nd degree polynomial"]);
  const pyish = await call(client, "check_redos", { pattern: "(?P<w>(a|a)+)$", verify: false });
  assert.equal(pyish.data.status, "vulnerable");
});
