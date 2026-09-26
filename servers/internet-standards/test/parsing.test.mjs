// Parsers and rules on synthetic inputs, one rule per test.
import assert from "node:assert/strict";
import test from "node:test";
import { canFollow, findHeadings, normalizeSectionId, parseRfcText, sectionText, stripPagination } from "../src/rfctext.mjs";
import { countErrata, errataMatches, errataSections, parseErrata } from "../src/errata.mjs";
import { draftBase, rfcNumber, seriesId } from "../src/rfcindex.mjs";
import { matchRows, parseCsv, parseReferences, REGISTRIES } from "../src/iana.mjs";
import { memo, replacements } from "../src/data.mjs";

test("identifiers: RFC numbers, series ids and draft names in their common spellings", () => {
  for (const s of ["RFC 2616", "rfc2616", "2616", "RFC-2616", "RFC02616"]) assert.equal(rfcNumber(s), 2616);
  assert.equal(rfcNumber("the http spec"), undefined);
  assert.equal(seriesId("bcp14"), "BCP14");
  assert.equal(seriesId("STD-97"), "STD97");
  assert.equal(draftBase("draft-ietf-httpbis-semantics-19"), "draft-ietf-httpbis-semantics");
  assert.equal(draftBase("draft-ietf-httpbis-semantics.txt"), "draft-ietf-httpbis-semantics");
});

test("section ids from how people write them", () => {
  assert.equal(normalizeSectionId("Section 15.5.5"), "15.5.5");
  assert.equal(normalizeSectionId("§ 4.1."), "4.1");
  assert.equal(normalizeSectionId("Appendix A.1"), "A.1");
  assert.equal(normalizeSectionId("appendix-b"), "B");
  assert.equal(normalizeSectionId("section-3"), "3");
  assert.equal(normalizeSectionId("Accept"), undefined);
});

const PAGED = [
  "1.  Introduction",
  "",
  "   Text of the introduction that runs on",
  "",
  "Fielding, et al.             Standards Track                   [Page 3]",
  "\fRFC 9999                       Example                      June 2014",
  "",
  "   and continues on the next page.",
  "",
  "1.1.  Scope",
  "",
  "   1. a numbered list item, not a heading",
  "",
  "2.  Second",
  "",
  "   Body.",
].join("\n");

test("pagination: footers and running headers go, a sentence split across pages rejoins", () => {
  const lines = stripPagination(PAGED);
  assert.ok(!lines.some((l) => /\[Page 3\]|^RFC 9999/.test(l)));
  const i = lines.indexOf("   Text of the introduction that runs on");
  assert.equal(lines[i + 1], "   and continues on the next page.");
});

test("headings: only at the margin, in order; list items and contents lines are not headings", () => {
  const doc = parseRfcText(PAGED);
  assert.deepEqual(doc.sections.map((s) => s.id), ["1", "1.1", "2"]);
  assert.equal(sectionText(doc, doc.sections[0]), "Text of the introduction that runs on\nand continues on the next page.");
  assert.match(sectionText(doc, doc.sections[0], { subtree: true }), /1\. a numbered list item/);
  assert.deepEqual(findHeadings(["", "1.  Introduction ........ 3", "", "1.  Introduction"]).map((h) => h.id), ["1"]);
  assert.equal(canFollow([1, 1], [1, 2]), true);
  assert.equal(canFollow([1, 1], [7]), false, "jumps are refused");
  assert.equal(canFollow([2], [1, 1]), false, "backwards is refused");
});

test("errata: section fields with pages, lists, appendices and whole-document reports", () => {
  assert.deepEqual(errataSections("5.1, pg.12"), ["5.1"]);
  assert.deepEqual(errataSections("6 and 7.1"), ["6", "7.1"]);
  assert.deepEqual(errataSections("Appendix A.2"), ["A.2"]);
  assert.deepEqual(errataSections("GLOBAL"), ["GLOBAL"]);
  assert.deepEqual(errataSections("Table 3 in 4.2"), ["4.2"]);
  const byRfc = parseErrata([
    { "doc-id": "RFC9110", errata_id: "2", errata_status_code: "Verified", errata_type_code: "Technical", section: "12.5.1" },
    { "doc-id": "RFC9110", errata_id: "1", errata_status_code: "Rejected", errata_type_code: "Editorial", section: "12.5.1" },
    { "doc-id": "RFC0791", errata_id: "3", errata_status_code: "Reported", section: "3.1" },
  ]);
  assert.deepEqual(byRfc.get(9110).map((r) => r.id), [1, 2]);
  assert.ok(byRfc.has(791));
  assert.deepEqual(countErrata(byRfc.get(9110)), { verified: 1, held: 0, reported: 0, rejected: 1 });
  assert.equal(errataMatches(byRfc.get(9110)[1], "12.5"), false);
  assert.equal(errataMatches(byRfc.get(9110)[1], "12.5", { subtree: true }), true);
});

test("CSV: quotes, doubled quotes, commas and newlines inside fields, CRLF and BOM", () => {
  const rows = parseCsv('﻿Value,Description\r\n"0x00,0x01","A ""quoted""\nline"\r\n5,plain\r\n');
  assert.deepEqual(rows, [{ Value: "0x00,0x01", Description: 'A "quoted"\nline' }, { Value: "5", Description: "plain" }]);
});

test("IANA references and matching: exact first, ranges, then text", () => {
  assert.deepEqual(parseReferences("[RFC9110, Section 15.5.5][RFC 6733]"), [{ rfc: 9110, section: "15.5.5" }, { rfc: 6733 }]);
  const reg = REGISTRIES["port-numbers"];
  const rows = [{ "Port Number": "80", "Service Name": "http" }, { "Port Number": "6000-6063", "Service Name": "x11" }, { "Port Number": "8080", "Service Name": "http-alt" }];
  assert.deepEqual(matchRows(rows, reg, "80"), { exact: true, rows: [rows[0]] });
  assert.deepEqual(matchRows(rows, reg, "6010"), { exact: true, rows: [rows[1]] });
  assert.deepEqual(matchRows(rows, reg, "http").rows.length, 1, "the service name matches exactly");
  assert.equal(matchRows(rows, reg, "alt").exact, false);
});

test("memo: shares one load between callers, expires, and forgets failures", async () => {
  let now = 0;
  let loads = 0;
  const m = memo({ ttlMs: 10, now: () => now });
  const load = () => Promise.resolve(++loads);
  assert.deepEqual(await Promise.all([m("k", load), m("k", load)]), [1, 1]);
  now = 11;
  assert.equal(await m("k", load), 2);
  await assert.rejects(m("bad", () => Promise.reject(new Error("x"))));
  assert.equal(await m("bad", () => Promise.resolve("ok")), "ok");
});

const storeOf = (graph) => ({ meta: async (n) => ({ obsoleted_by: (graph[n] ?? []).map((x) => `RFC${x}`) }) });

test("replacements: follows every branch to its end; branches that merge give one replacement", async () => {
  assert.deepEqual(await replacements(storeOf({ 1: [2, 3], 2: [4], 3: [], 4: [] }), { n: 1, obsoletedBy: [2, 3] }), [3, 4]);
  assert.deepEqual(await replacements(storeOf({ 1: [2, 3], 2: [4], 3: [5], 5: [4] }), { n: 1, obsoletedBy: [2, 3] }), [4]);
});

test("replacements: a cycle in the data ends the walk instead of looping", async () => {
  assert.deepEqual(await replacements(storeOf({ 1: [2, 3], 2: [4], 3: [], 4: [1] }), { n: 1, obsoletedBy: [2, 3] }), [3]);
});

test("search: a current RFC outranks an obsolete one with the same words", async () => {
  const { searchIndex } = await import("../src/rfcindex.mjs");
  const entry = (n, obsoletedBy) => ({ n, title: "Widget Transfer Protocol", keywords: [], abstract: "", obsoletedBy, status: "Proposed Standard", year: 2000 + n });
  const index = { rfcs: new Map([[1, entry(1, [])], [2, entry(2, [])]]) };
  index.rfcs.get(2).obsoletedBy = [1];
  index.rfcs.get(2).year = 2030;
  assert.deepEqual(searchIndex(index, "widget transfer").map((r) => r.n), [1, 2], "the newer-numbered obsolete one comes second");
  assert.deepEqual(searchIndex(index, "widget transfer", { includeObsolete: false }).map((r) => r.n), [1]);
});
