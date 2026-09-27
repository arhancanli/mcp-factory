// Unit rules: how disagreements between engines are described. No engine.
import assert from "node:assert/strict";
import test from "node:test";
import { differences, testRegex } from "../src/check.mjs";

const r = (flavor, count, texts, replaced) => ({ flavor, results: [{ match_count: count, matches: texts.map((t, i) => ({ index: i, text: t, groups: [] })), ...(replaced !== undefined ? { replaced } : {}) }] });

test("engines that agree produce no differences", () => {
  assert.deepEqual(differences([r("javascript", 1, ["a"]), r("python", 1, ["a"])], ["a"]), []);
});

test("compile refusals, match differences and replacement differences are each named", () => {
  const out = differences([r("javascript", 2, ["a", "b"], "x"), r("python", 1, ["a"], "y"), { flavor: "re2", error: { message: "invalid perl operator: (?<" } }], ["ab"]);
  assert.deepEqual(out, ["compiles in javascript, python; refused by re2 (invalid perl operator: (?<)", 'input 1: javascript: 2 matches ("a", "b"); python: 1 match ("a")', 'input 1 replaced: javascript: "x"; python: "y"']);
});

test("an input with no match says so", () => {
  assert.deepEqual(differences([r("javascript", 0, []), r("pcre", 1, ["z"])], ["z"]), ['input 1: javascript: no match; pcre: 1 match ("z")']);
});

test("an engine that fails outright is reported as failed; the others still answer", async () => {
  const ctx = {
    runJob: async (_, job) => {
      if (job.op === "version") return job.flavor;
      if (job.flavor === "python") throw new Error("The python engine failed: boom");
      return { results: [{ match_count: 1, matches: [{ index: 0, text: "a", groups: [] }] }] };
    },
  };
  const out = await testRegex(ctx, { pattern: "a", inputs: ["a"], flavors: ["javascript", "python"] });
  assert.deepEqual(out.engines.map((e) => [e.flavor, e.failed ?? e.results[0].match_count]), [["javascript", 1], ["python", "The python engine failed: boom"]]);
  assert.equal(out.agree, false);
});
