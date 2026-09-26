// Golden tests: every tool over a real MCP client, replaying responses recorded by test/record.mjs.
// No test here touches the network.
import assert from "node:assert/strict";
import test from "node:test";
import { call, connect, replayFetch } from "./replay.mjs";

test("rfc_info: obsolete RFCs lead to today's replacements; series and drafts resolve; missing numbers are explicit", async () => {
  const client = await connect();
  const { res, data } = await call(client, "rfc_info", { ids: ["RFC 2616", "BCP 14", "draft-ietf-httpbis-semantics", "RFC 99999"] });
  assert.ok(!res.isError);
  const [http11, bcp1, bcp2, draft, missing] = data.results;
  assert.equal(http11.current, false);
  assert.deepEqual(http11.obsoleted_by, ["RFC 7230", "RFC 7231", "RFC 7232", "RFC 7233", "RFC 7234", "RFC 7235"]);
  assert.deepEqual(http11.current_replacements, ["RFC 9110", "RFC 9111", "RFC 9112"], "the end of every obsoleted-by chain");
  assert.equal(http11.status, "Draft Standard");
  assert.equal(http11.abstract, undefined, "abstracts only for three ids or fewer, to keep batches small");
  const one = (await call(client, "rfc_info", { ids: ["RFC 2616"] })).data.results[0];
  assert.match(one.abstract, /^HTTP has been in use/);
  assert.deepEqual([bcp1.rfc, bcp2.rfc], ["RFC 2119", "RFC 8174"]);
  assert.equal(bcp1.series, "BCP14");
  assert.deepEqual(bcp1.updated_by, ["RFC 8174"]);
  assert.equal(draft.rfc, "RFC 9110");
  assert.equal(draft.current, true);
  assert.equal(draft.current_replacements, undefined);
  assert.deepEqual([missing.id, missing.error], ["RFC 99999", "not_found"]);
});

test("rfc_info: an id that is none of RFC, series or draft says what to give", async () => {
  const client = await connect();
  const { data } = await call(client, "rfc_info", { ids: ["the http spec"] });
  assert.equal(data.results[0].error, "not_an_id");
});

test("rfc_section: exact section text with the verified errata filed against it", async () => {
  const client = await connect();
  const { data } = await call(client, "rfc_section", { rfc: "9110", section: "12.5.1" });
  assert.equal(data.section, "12.5.1");
  assert.equal(data.section_title, "Accept");
  assert.match(data.text, /^The "Accept" header field can be used by user agents/);
  assert.ok(data.errata.some((e) => e.id === 7138 && e.type === "technical" && e.status === "verified"));
  assert.ok(data.errata.every((e) => e.status === "verified" || e.status === "held"), "reported and rejected reports are counted, not shown");
  assert.equal(data.warning, undefined, "RFC 9110 is current");
});

test("rfc_section: paginated RFCs are rejoined, and obsolete RFCs carry a warning", async () => {
  const client = await connect();
  const { data } = await call(client, "rfc_section", { rfc: "RFC 7231", section: "6.5.4" });
  assert.equal(data.section_title, "404 Not Found");
  assert.ok(!/\[Page \d+\]/.test(data.text), "no page footers inside the text");
  assert.ok(!/RFC 7231\s+HTTP\/1\.1 Semantics and Content/.test(data.text), "no running headers");
  assert.deepEqual(data.obsoleted_by, ["RFC 9110"]);
  assert.match(data.warning, /obsolete/);
});

test("rfc_section: phrase search, table of contents, and a missing section", async () => {
  const client = await connect();
  const found = (await call(client, "rfc_section", { rfc: "9110", find: "must not generate" })).data;
  assert.ok(found.matches.length > 5);
  assert.ok(found.matches.some((m) => m.section === "2.2" && /MUST NOT generate/.test(m.snippet)));
  const toc = (await call(client, "rfc_section", { rfc: "9110" })).data;
  assert.ok(toc.contents.some((c) => c.section === "15.5" && c.title === "Client Error 4xx"));
  assert.ok(toc.contents.every((c) => !/^\d+\.\d+\.\d/.test(c.section)), "two levels only");
  assert.ok(toc.total_sections > toc.contents.length);
  const branch = (await call(client, "rfc_section", { rfc: "9110", section: "15.5" })).data;
  assert.ok(branch.subsections.some((x) => x.section === "15.5.5" && x.title === "404 Not Found"), "drill down from a section to its subsections");
  const missing = await call(client, "rfc_section", { rfc: "9110", section: "99.9" });
  assert.equal(missing.res.isError, true);
  assert.equal(missing.data.error.code, "section_not_found");
});

test("search_rfcs: the current document ranks first; obsolete ones say what replaced them", async () => {
  const client = await connect();
  const { data } = await call(client, "search_rfcs", { query: "http semantics" });
  assert.equal(data.results[0].rfc, "RFC 9110");
  const old = data.results.find((r) => r.rfc === "RFC 7231");
  assert.deepEqual(old.obsoleted_by, ["RFC 9110"]);
  const current = (await call(client, "search_rfcs", { query: "http semantics", include_obsolete: false })).data;
  assert.ok(current.results.every((r) => !r.obsoleted_by));
});

test("iana_lookup: exact values, the defining RFC section, and registries spread over several files", async () => {
  const { impl, calls } = replayFetch();
  const client = await connect(impl);
  const status = (await call(client, "iana_lookup", { registry: "http-status-codes", query: "418" })).data;
  assert.equal(status.exact, true);
  assert.deepEqual(status.entries[0].rfcs, ["RFC 9110 section 15.5.19"]);
  const json = (await call(client, "iana_lookup", { registry: "media-types", query: "application/json" })).data;
  assert.equal(json.entries[0].Reference, "[RFC 8259]");
  assert.equal(calls.filter((c) => c.includes("/media-types/")).length, 10, "every top-level media type file is read");
  const port = (await call(client, "iana_lookup", { registry: "port-numbers", query: "5432" })).data;
  assert.deepEqual(port.entries.map((e) => [e["Service Name"], e["Transport Protocol"]]), [["postgresql", "tcp"], ["postgresql", "udp"]]);
  const none = await call(client, "iana_lookup", { registry: "http-status-codes", query: "999" });
  assert.equal(none.data.error.code, "no_match");
});

test("rfc_section: reported and rejected errata are counted but never shown as corrections", async () => {
  const { loadFixtures } = await import("./replay.mjs");
  const fixtures = loadFixtures();
  const key = "www.rfc-editor.org/api/v1/errata.json";
  const rows = JSON.parse(fixtures[key].body);
  rows.push({ errata_id: "999001", "doc-id": "RFC9110", errata_status_code: "Rejected", errata_type_code: "Technical", section: "12.5.1", orig_text: "wrong", correct_text: "also wrong" });
  rows.push({ errata_id: "999002", "doc-id": "RFC9110", errata_status_code: "Reported", errata_type_code: "Editorial", section: "12.5.1", orig_text: "x", correct_text: "y" });
  fixtures[key] = { ...fixtures[key], body: JSON.stringify(rows) };
  const client = await connect(replayFetch(fixtures).impl);
  const { data } = await call(client, "rfc_section", { rfc: "9110", section: "12.5.1" });
  assert.ok(!data.errata.some((e) => e.id === 999001 || e.id === 999002));
  assert.ok(data.errata_counts.rejected >= 1 && data.errata_counts.reported >= 1);
});
