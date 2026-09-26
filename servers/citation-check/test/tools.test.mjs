// Golden tests: every tool over a real MCP client, replaying source responses recorded by
// test/record.mjs. No test here touches the network.
import assert from "node:assert/strict";
import test from "node:test";
import { call, connect, replayFetch } from "./replay.mjs";
import { BIBTEX, REFERENCE_LIST, RETRACTION_DOIS } from "./scenarios.mjs";

test("check_references: a mixed list gets the right verdict for each citation", async () => {
  const client = await connect();
  const { res, data } = await call(client, "check_references", { text: REFERENCE_LIST });
  assert.ok(!res.isError);
  assert.deepEqual(data.counts, { verified: 3, mismatch: 2, not_found: 1, unverifiable: 0, retracted: 1 });
  const [wakefield, kucsko, vaswani, borrowed, wrongYear, invented] = data.results;

  assert.equal(wakefield.verdict, "verified", "the citation is accurate; the work is retracted");
  assert.equal(wakefield.matched.doi, "10.1016/s0140-6736(97)11096-0", "the original, not the same-titled letter");
  assert.deepEqual(wakefield.flags, ["doi_added", "corrected", "retracted"]);
  assert.deepEqual(wakefield.notices.map((n) => [n.type, n.notice_doi, n.date]), [["correction", "10.1016/s0140-6736(04)15715-2", "2004-03-06"], ["retraction", "10.1016/s0140-6736(10)60175-4", "2010-02-06"]]);

  assert.equal(kucsko.verdict, "verified");
  assert.equal(kucsko.flags, undefined);

  assert.equal(vaswani.verdict, "verified", "a conference paper not in Crossref is found through DataCite (arXiv)");
  assert.equal(vaswani.matched.doi, "10.48550/arxiv.1706.03762");
  assert.equal(vaswani.matched.year, 2017, "not the 2025 repost Crossref and OpenAlex rank first");

  assert.equal(borrowed.verdict, "mismatch");
  assert.deepEqual(borrowed.flags, ["identifier_points_to_different_work"]);
  assert.equal(borrowed.identifier_resolves_to.title, "Nanometre-scale thermometry in a living cell");
  assert.equal(borrowed.matched, undefined, "the borrowed DOI's work is not presented as the match");

  assert.equal(wrongYear.verdict, "mismatch");
  assert.deepEqual(wrongYear.diffs, [{ field: "year", cited: "2011", record: "2013" }]);

  assert.equal(invented.verdict, "not_found");
  assert.match(invented.note, /may be fabricated/);
});

test("check_references: BibTeX in, corrected BibTeX out, keys kept; unregistered DOIs flagged", async () => {
  const client = await connect();
  const { data } = await call(client, "check_references", { text: BIBTEX, bibtex: true });
  const [real, fake] = data.results;
  assert.equal(real.key, "kucsko2013");
  assert.equal(real.verdict, "verified");
  assert.match(real.bibtex, /^@article\{kucsko2013,/);
  assert.match(real.bibtex, /number = \{7460\}/, "missing fields are filled from the record");
  assert.match(real.bibtex, /doi = \{10\.1038\/nature12373\}/);
  assert.equal(fake.key, "fake2020");
  assert.equal(fake.verdict, "not_found");
  assert.ok(fake.flags.includes("doi_not_registered"));
  assert.equal(fake.bibtex, undefined, "no BibTeX is invented for a work that was not found");
});

test("check_references: empty input is a clear error", async () => {
  const client = await connect();
  const { res, data } = await call(client, "check_references", { text: "   \n  " });
  assert.equal(res.isError, true);
  assert.equal(data.error.code, "no_references");
});

test("lookup_work: arXiv id, PMID and DOI link resolve; retractions and notices come with them", async () => {
  const client = await connect();
  const arxiv = (await call(client, "lookup_work", { id: "arXiv:1706.03762v5" })).data;
  assert.equal(arxiv.doi, "10.48550/arxiv.1706.03762");
  assert.equal(arxiv.year, 2017);
  assert.match(arxiv.bibtex, /eprint = \{1706\.03762\}/);

  const pmid = (await call(client, "lookup_work", { id: "PMID: 9500320" })).data;
  assert.equal(pmid.doi, "10.1016/s0140-6736(97)11096-0");
  assert.deepEqual(pmid.flags, ["corrected", "retracted"]);
  assert.match(pmid.bibtex, /title = \{Ileal-lymphoid-nodular/, "the RETRACTED watermark is not part of the citation title");

  const link = (await call(client, "lookup_work", { id: "https://doi.org/10.1126/science.1197258" })).data;
  assert.deepEqual(link.flags, ["retracted", "expression_of_concern"]);
  assert.equal(link.notices.length, 2, "a notice Crossref lists twice appears once");
});

test("lookup_work: an invented DOI is reported as unregistered", async () => {
  const client = await connect();
  const { res, data } = await call(client, "lookup_work", { id: "10.9999/this-doi-does-not-exist-xyz" });
  assert.equal(res.isError, true);
  assert.equal(data.error.code, "doi_not_registered");
});

test("check_retractions: statuses in one batched request; problems, then unknowns, then clean", async () => {
  const { impl, calls } = replayFetch();
  const client = await connect(impl);
  const { data } = await call(client, "check_retractions", { dois: RETRACTION_DOIS });
  assert.deepEqual(data.counts, { retracted: 2, none: 1, not_a_doi: 1, not_in_crossref: 1 });
  assert.deepEqual(data.results.map((r) => [r.doi, r.status]), [
    ["10.1126/science.1197258", "retracted"],
    ["10.1016/s0140-6736(97)11096-0", "retracted"],
    ["not a doi", "not_a_doi"],
    ["10.48550/arxiv.1706.03762", "not_in_crossref"],
    ["10.1038/nature12373", "none"],
  ]);
  assert.equal(calls.filter((c) => c.startsWith("api.crossref.org/works?filter=")).length, 1);
});
