// Golden tests: every tool over a real MCP client, replaying responses recorded by test/record.mjs.
// No test here touches the network.
import assert from "node:assert/strict";
import test from "node:test";
import { call, connect, replayFetch } from "./replay.mjs";

test("find_drug: ingredients, brands, classes, and the originator's label ranked above generics", async () => {
  const client = await connect();
  const { res, data } = await call(client, "find_drug", { name: "atorvastatin" });
  assert.ok(!res.isError);
  assert.equal(data.rxcui, "83367");
  assert.equal(data.term_type, "IN");
  assert.ok(data.brands.includes("Lipitor"));
  assert.ok(data.classes.some((c) => c.name === "HMG-CoA Reductase Inhibitor"));
  assert.equal(data.labels[0].manufacturer, "Viatris Specialty LLC");
  assert.equal(data.labels[0].application, "NDA020702", "the originator's NDA label first");
  assert.ok(data.labels.slice(1).every((l) => l.category === "ANDA" || !/and/i.test(l.generic)), "then single-ingredient generics");
  assert.ok(data.labels.every((l) => !/amlodipine/i.test(l.generic)), "combinations are not the answer to an ingredient query");
});

test("find_drug: a misspelling is corrected when one name is clearly meant, and says so", async () => {
  const client = await connect();
  const { data } = await call(client, "find_drug", { name: "atorvastatn" });
  assert.equal(data.name, "atorvastatin");
  assert.equal(data.corrected_from, "atorvastatn");
});

test("find_drug: an unknown name is a clear error", async () => {
  const client = await connect();
  const { res, data } = await call(client, "find_drug", { name: "zzqq-fake-drug" });
  assert.equal(res.isError, true);
  assert.equal(data.error.code, "not_found");
});

test("label_section: the boxed warning in the label's own words, cited to its set id, version and date", async () => {
  const client = await connect();
  const { data } = await call(client, "label_section", { drug: "warfarin", topic: "boxed_warning" });
  assert.equal(data.found, true);
  assert.equal(data.sections[0].heading, "WARNING: BLEEDING RISK");
  assert.match(data.sections[0].text, /can cause major or fatal bleeding/);
  assert.match(data.label.setid, /^[0-9a-f-]{36}$/);
  assert.ok(Number.isInteger(data.label.version));
  assert.match(data.label.effective, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(data.label.url, /^https:\/\/dailymed\.nlm\.nih\.gov\/dailymed\/drugInfo\.cfm\?setid=/);
  assert.ok(data.choice.other_labels > 0, "says how many other labels exist");
});

test("label_section: a label without the section says so instead of failing", async () => {
  const client = await connect();
  const { res, data } = await call(client, "label_section", { drug: "Lipitor", topic: "boxed_warning" });
  assert.ok(!res.isError);
  assert.equal(data.found, false);
  assert.deepEqual(data.sections, []);
  assert.equal(data.label.labeler, "Viatris Specialty LLC");
  assert.match(data.note, /no boxed warning section/);
});

test("label_section: contraindications from a manufacturer's label, not a repackager's", async () => {
  const client = await connect();
  const { data } = await call(client, "label_section", { drug: "metformin", topic: "contraindications" });
  assert.equal(data.found, true);
  assert.match(data.sections[0].text, /Severe renal impairment/);
  assert.ok(!/repack|prepack/i.test(data.label.labeler));
});

test("search_label: every paragraph that mentions a term, with its heading and topic", async () => {
  const client = await connect();
  const { data } = await call(client, "search_label", { drug: "Lipitor", term: "grapefruit" });
  assert.ok(data.total >= 3);
  assert.ok(data.matches.some((m) => m.topic === "interactions"));
  assert.ok(data.matches.some((m) => /1\.2 liters/.test(m.text)));
});

test("recalls_shortages: FDA recalls newest first, searched under the plain ingredient name", async () => {
  const { impl, calls } = replayFetch();
  const client = await connect(impl);
  const { data } = await call(client, "recalls_shortages", { drug: "metformin" });
  assert.deepEqual(data.searched, ["metformin"], "not the combination names RxNorm also lists");
  assert.ok(data.recalls_total > 10);
  assert.ok(data.recalls.every((r) => /^Class (I|II|III)$/.test(r.class)));
  const dates = data.recalls.map((r) => r.date);
  assert.deepEqual(dates, [...dates].sort().reverse(), "newest first");
  assert.ok(calls.some((c) => c.includes("enforcement.json") && c.includes("openfda.generic_name") && c.includes("openfda.brand_name")));
});
