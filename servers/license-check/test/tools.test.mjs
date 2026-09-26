// Golden tests: every tool over a real MCP client, replaying the SPDX License List, OSADL's
// checklists and deps.dev as recorded by test/record.mjs. No test here touches the network.
import assert from "node:assert/strict";
import test from "node:test";
import { call, connect } from "./replay.mjs";

test("check_compatibility: OSADL's verdicts with reasons; OR picks the usable option; worst first", async () => {
  const client = await connect();
  const { data } = await call(client, "check_compatibility", { project: "GPL-2.0-only", licenses: ["MIT", "Apache-2.0", "MIT OR GPL-3.0-only", "GPL-2.0-only WITH Classpath-exception-2.0", "LGPL-2.1-or-later", "Foo License"] });
  const by = Object.fromEntries(data.results.map((r) => [r.license, r]));
  assert.equal(by["Apache-2.0"].verdict, "no");
  assert.match(by["Apache-2.0"].reason, /Incompatibility of the Apache-2\.0 license with the GPL-2\.0-only license/);
  assert.deepEqual([by["MIT OR GPL-3.0-only"].verdict, by["MIT OR GPL-3.0-only"].via], ["yes", "MIT"]);
  assert.equal(by["LGPL-2.1-or-later"].verdict, "check");
  assert.equal(by["Foo License"].verdict, "unknown");
  const order = ["no", "unknown", "check", "yes"];
  const ranks = data.results.map((r) => order.indexOf(r.verdict));
  assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b), "worst first");
  assert.notEqual(data.results.at(-1).verdict, "no");
  assert.deepEqual(data.counts, { no: 1, unknown: 1, check: 1, yes: 3 });
  assert.match(data.note, /Not legal advice/);
  const bad = await call(client, "check_compatibility", { project: "Totally Made Up License", licenses: ["MIT"] });
  assert.equal(bad.data.error.code, "unknown_license");
});

test("check_compatibility for a proprietary project: by copyleft class; content and source-available licenses by kind", async () => {
  const client = await connect();
  const { data } = await call(client, "check_compatibility", { project: "Proprietary", licenses: ["MIT", "GPL-3.0-only", "LGPL-2.1-only", "MPL-2.0", "AGPL-3.0-only", "CC-BY-4.0", "SSPL-1.0"] });
  const v = Object.fromEntries(data.results.map((r) => [r.license, r.verdict]));
  assert.deepEqual(v, { MIT: "yes", "GPL-3.0-only": "no", "LGPL-2.1-only": "check", "MPL-2.0": "check", "AGPL-3.0-only": "no", "CC-BY-4.0": "yes", "SSPL-1.0": "check" });
  assert.match(data.results.find((r) => r.license === "SSPL-1.0").reason, /source-available, not open source/);
});

test("license_info: SPDX ids from informal names, deprecated forms and expressions", async () => {
  const client = await connect();
  const { data } = await call(client, "license_info", { licenses: ["Apache License 2.0", "GPLv3", "New BSD", "GPL-2.0+", "MIT OR Apache-2.0", "SSPL"] });
  assert.deepEqual(data.results.map((r) => r.id ?? r.licenses.map((l) => l.id).join("|")), ["Apache-2.0", "GPL-3.0-only", "BSD-3-Clause", "GPL-2.0-or-later", "MIT|Apache-2.0", "SSPL-1.0"]);
  const gpl = data.results[1];
  assert.deepEqual([gpl.osi_approved, gpl.copyleft], [true, "Yes"]);
  assert.equal(data.results[5].osi_approved, false);
  assert.match(data.results[0].obligations, /unreflicenses\/Apache-2\.0\.txt$/);
});

test("package_licenses: licenses from deps.dev, checked against the project", async () => {
  const client = await connect();
  const { data } = await call(client, "package_licenses", { packages: [{ ecosystem: "npm", name: "caniuse-lite", version: "1.0.30001812" }, { ecosystem: "npm", name: "react", version: "19.3.0" }, { ecosystem: "pypi", name: "PyQt5", version: "5.15.11" }, { ecosystem: "npm", name: "sharp", version: "0.35.4" }], project: "MIT" });
  const by = Object.fromEntries(data.results.map((r) => [r.package.split("@")[0], r]));
  assert.deepEqual([by["pypi:PyQt5"].license, by["pypi:PyQt5"].copyleft, by["pypi:PyQt5"].verdict], ["GPL-3.0", "Yes", "no"]);
  assert.equal(by["npm:caniuse-lite"].verdict, "yes", "CC-BY-4.0 by its kind: attribution");
  assert.equal(by["npm:react"].verdict, "yes");
  assert.equal(data.results[0].package.split("@")[0], "pypi:PyQt5", "worst first");
});
