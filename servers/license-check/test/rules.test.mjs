// The rules against small hand-made data: name resolution, expression parsing, and verdicts for
// OR, AND and exceptions. No network.
import assert from "node:assert/strict";
import test from "node:test";
import { judge } from "../src/compat.mjs";
import { expressionText, parseExpression, resolveId } from "../src/licenses.mjs";

const ids = ["MIT", "Apache-2.0", "GPL-2.0-only", "GPL-2.0-or-later", "GPL-3.0-only", "LGPL-2.1-only", "BSD-3-Clause", "GPL-2.0", "CC-BY-4.0"];
const byId = new Map(ids.map((id) => [id, { licenseId: id, name: id === "BSD-3-Clause" ? 'BSD 3-Clause "New" or "Revised" License' : id }]));
const fold = (s) => s.toLowerCase().replace(/[^a-z0-9.+]+/g, "");
const byFold = new Map([...byId.keys()].map((id) => [fold(id), id]));
byFold.set(fold(byId.get("BSD-3-Clause").name), "BSD-3-Clause");
byFold.set("newbsd", "BSD-3-Clause");
byFold.set("gplv2", "GPL-2.0-only");
const data = {
  byId,
  byFold,
  exceptions: new Map([["classpath-exception-2.0", { licenseExceptionId: "Classpath-exception-2.0" }]]),
  osadl: {
    known: new Set(["MIT", "Apache-2.0", "GPL-2.0-only", "GPL-3.0-only", "LGPL-2.1-only"]),
    copyleft: { MIT: "No", "Apache-2.0": "No", "GPL-2.0-only": "Yes", "GPL-3.0-only": "Yes", "LGPL-2.1-only": "Yes (restricted)" },
    pairs: new Map([
      ["MIT|Apache-2.0", { verdict: "Yes", why: "both permissive" }],
      ["MIT|GPL-3.0-only", { verdict: "No", why: "copyleft into permissive" }],
      ["MIT|GPL-2.0-only", { verdict: "No", why: "copyleft into permissive" }],
      ["MIT|LGPL-2.1-only", { verdict: "Check dependency", why: "linking" }],
      ["MIT|MIT", { verdict: "Same", why: "n.a." }],
    ]),
  },
};

test("names: SPDX ids, names, aliases, deprecated ids and old or-later suffixes", () => {
  assert.equal(resolveId(data, "MIT"), "MIT");
  assert.equal(resolveId(data, 'BSD 3-Clause "New" or "Revised" License'), "BSD-3-Clause");
  assert.equal(resolveId(data, "new BSD"), "BSD-3-Clause");
  assert.equal(resolveId(data, "GPL-2.0"), "GPL-2.0-only", "a deprecated id resolves to its current form");
  assert.equal(resolveId(data, "GPL-2.0+"), "GPL-2.0-or-later");
  assert.equal(resolveId(data, "LGPL-2.1"), "LGPL-2.1-only", "a deprecated id the list no longer carries");
  assert.equal(resolveId(data, "GPLv2"), "GPL-2.0-only");
  assert.equal(resolveId(data, "nonsense"), undefined);
});

test("expressions: AND binds tighter than OR; parentheses; WITH; multi-word names", () => {
  const { tree } = parseExpression(data, "MIT OR Apache-2.0 AND GPL-2.0-only WITH classpath-exception-2.0");
  assert.equal(expressionText(tree), "(MIT OR (Apache-2.0 AND GPL-2.0-only WITH Classpath-exception-2.0))");
  assert.equal(expressionText(parseExpression(data, "(MIT OR GPL-3.0-only) AND BSD-3-Clause").tree), "((MIT OR GPL-3.0-only) AND BSD-3-Clause)");
  assert.equal(parseExpression(data, "new BSD").tree.license, "BSD-3-Clause");
  assert.deepEqual(parseExpression(data, "Mystery-1.0").unknown, ["Mystery-1.0"]);
});

test("verdicts: OR takes the best option, AND the worst; a linking exception turns no into check", () => {
  const mit = { id: "MIT" };
  const v = (e) => judge(data, mit, parseExpression(data, e).tree);
  assert.deepEqual([v("GPL-3.0-only OR Apache-2.0").verdict, v("GPL-3.0-only OR Apache-2.0").via], ["yes", "Apache-2.0"]);
  assert.equal(v("Apache-2.0 AND GPL-3.0-only").verdict, "no");
  assert.equal(v("Apache-2.0 AND LGPL-2.1-only").verdict, "check");
  assert.equal(v("GPL-2.0-only WITH Classpath-exception-2.0").verdict, "check");
  assert.equal(v("MIT").verdict, "yes");
  assert.equal(v("CC-BY-4.0").verdict, "yes", "not in the matrix: judged by its kind");
});
