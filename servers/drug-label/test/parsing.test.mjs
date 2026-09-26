// Rules on synthetic inputs: label ranking, spelling safety, SPL parsing, term matching.
import assert from "node:assert/strict";
import test from "node:test";
import { rankLabels, SETID } from "../src/drugs.mjs";
import { editDistance, pickSuggestion } from "../src/rxnorm.mjs";
import { headingOf, readSpl, sectionsWithin, termPattern, topicOf, topicSections } from "../src/spl.mjs";

test("ranking: exact name, then single ingredient, then the originator's NDA, then longest marketed", () => {
  const labels = [
    { setid: "combo", brand: "Caduet", generic: "amlodipine and atorvastatin", application: "NDA021540", since: "2004-01-30" },
    { setid: "anda-new", brand: "Atorvastatin Calcium", generic: "atorvastatin calcium", application: "ANDA1", since: "2020-01-01" },
    { setid: "nda", brand: "Lipitor", generic: "atorvastatin calcium", application: "NDA020702", since: "2024-05-01" },
    { setid: "anda-old", brand: "Atorvastatin Calcium", generic: "atorvastatin calcium", application: "ANDA2", since: "2012-05-29" },
  ];
  assert.deepEqual(rankLabels(labels, { name: "atorvastatin", tty: "IN" }).map((l) => l.setid), ["nda", "anda-old", "anda-new", "combo"]);
  assert.equal(rankLabels(labels, { name: "Caduet", tty: "BN" })[0].setid, "combo", "a brand query wants that brand");
  const withCombo = [...labels, { setid: "combo-nda", brand: "Combo", generic: "atorvastatin calcium and ezetimibe", application: "NDA999", since: "2001-01-01" }];
  assert.notEqual(rankLabels(withCombo, { name: "atorvastatin", tty: "IN" }).slice(0, 3).map((l) => l.setid).indexOf("combo-nda"), 0);
  assert.ok(rankLabels(withCombo, { name: "atorvastatin", tty: "IN" }).findIndex((l) => l.setid === "combo-nda") > 2, "a combination whose name starts with the ingredient still ranks below single-ingredient labels");
});

test("spelling: a correction only when one suggestion is clearly closest; ties are refused", () => {
  assert.equal(editDistance("atorvastatn", "atorvastatin"), 1);
  assert.deepEqual(pickSuggestion("atorvastatn", ["atorvastatin", "rosuvastatin"]), { name: "atorvastatin" });
  assert.deepEqual(pickSuggestion("hydroxizine", ["hydroxyzine", "hydralazine"]), { name: "hydroxyzine" });
  assert.deepEqual(pickSuggestion("celexa", ["celexa", "cerebyx"]).name, "celexa");
  assert.deepEqual(pickSuggestion("celebrax", ["celebrex", "celebran"]), { ambiguous: ["celebrex", "celebran"] }, "never silently picks between equally close look-alikes");
  assert.deepEqual(pickSuggestion("abcd", ["abxy", "abzz"]), {}, "short names allow one edit only");
});

test("set ids are recognised", () => {
  assert.ok(SETID.test("a60cc18b-0631-4cf0-b021-9f52224ece65"));
  assert.ok(!SETID.test("lipitor"));
});

const SPL = `<?xml version="1.0"?>
<document xmlns="urn:hl7-org:v3">
  <setId root="11111111-2222-3333-4444-555555555555"/><versionNumber value="7"/><effectiveTime value="20250102"/>
  <code code="34391-3" displayName="HUMAN PRESCRIPTION DRUG LABEL"/>
  <author><assignedEntity><representedOrganization><name>Maker Inc</name></representedOrganization></assignedEntity></author>
  <component><structuredBody>
    <component><section><code code="34066-1" displayName="BOXED WARNING SECTION"/><title>WARNING: SERIOUS THING</title>
      <text><list><item>Can cause <content styleCode="bold">harm</content>.</item><item>Monitor levels.</item></list></text></section></component>
    <component><section><code code="34073-7"/><title>7 DRUG INTERACTIONS</title><text><paragraph>See table.</paragraph>
      <table><tbody><tr><td rowspan="2">Strong CYP3A4 inhibitors</td><td>Itraconazole</td></tr><tr><td>Grapefruit juice</td></tr></tbody></table></text>
      <component><section><code code="42229-5"/><title>7.1 Specific drugs</title><text><paragraph>Avoid grapefruit juice.</paragraph></text></section></component>
    </section></component>
  </structuredBody></component>
</document>`;

test("SPL: identity, lists as items, tables row by row with row-spanning cells repeated, nested subsections", () => {
  const label = readSpl(SPL);
  assert.equal(label.setId, "11111111-2222-3333-4444-555555555555");
  assert.equal(label.version, 7);
  assert.equal(label.effective, "2025-01-02");
  assert.equal(label.labeler, "Maker Inc");
  const boxed = sectionsWithin(label, topicSections(label, "boxed_warning"));
  assert.deepEqual(boxed[0].blocks, ["- Can cause harm.", "- Monitor levels."]);
  const inter = sectionsWithin(label, topicSections(label, "interactions"));
  assert.deepEqual(inter[0].blocks, ["See table.", "Strong CYP3A4 inhibitors | Itraconazole", "Strong CYP3A4 inhibitors | Grapefruit juice"]);
  assert.equal(headingOf(label, inter[1]), "7.1 Specific drugs");
  assert.equal(topicOf(label, inter[1]), "interactions", "a subsection inherits its parent's topic");
});

test("term matching: whole words, case-insensitive, flexible spacing", () => {
  assert.ok(termPattern("grapefruit").test("Avoid Grapefruit juice"));
  assert.ok(!termPattern("ace").test("replace the dose"));
  assert.ok(termPattern("grapefruit juice").test("grapefruit\n juice"));
});
