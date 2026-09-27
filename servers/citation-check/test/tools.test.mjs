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

test("lookup_work: when the sources rank only comments on a paper, the paper itself is found through them", async () => {
  const client = await connect();
  const { res, data } = await call(client, "lookup_work", { id: "A Bacterium That Can Grow by Using Arsenic Instead of Phosphorus Science 2011 retraction notice" });
  assert.ok(!res.isError);
  assert.equal(data.doi, "10.1126/science.1197258");
  assert.ok(data.flags.includes("retracted"));
  assert.ok(data.notices.some((n) => n.notice_doi === "10.1126/science.adu5488"));
});

test("lookup_work: the 2017 original, not the later copies the indexes rank first", async () => {
  const client = await connect();
  const { res, data } = await call(client, "lookup_work", { id: "Attention Is All You Need, Vaswani et al., 2017" });
  assert.ok(!res.isError);
  assert.deepEqual([data.doi, data.year, data.arxiv], ["10.48550/arxiv.1706.03762", 2017, "1706.03762"]);
  assert.match(data.authors, /^Ashish Vaswani/);
});

// A source where OpenAlex knows the Attention paper only under a 2025 repost's DOI (as it did in
// 2026), and every other source knows nothing: the later-copy handling alone decides the answer.
function laterCopyFetch({ arxivLocation }) {
  const counts = [[2026, 1161], [2025, 135], [2024, 26], [2023, 92], [2022, 771], [2021, 11180], [2020, 8258], [2019, 4208], [2018, 1010], [2017, 63]];
  const work = { id: "https://openalex.org/W2626778328", doi: "https://doi.org/10.65215/2q58a426", display_name: "Attention Is All You Need", publication_year: 2025, type: "article", cited_by_count: 26907, counts_by_year: counts.map(([year, n]) => ({ year, cited_by_count: n })), authorships: [{ author: { display_name: "Ashish Vaswani" } }, { author: { display_name: "Noam Shazeer" } }] };
  const arxiv = { data: { attributes: { doi: "10.48550/arXiv.1706.03762", titles: [{ title: "Attention Is All You Need" }], creators: [{ familyName: "Vaswani", givenName: "Ashish" }, { familyName: "Shazeer", givenName: "Noam" }], publicationYear: 2017, publisher: "arXiv", types: { resourceTypeGeneral: "Preprint" }, relatedIdentifiers: [] } } };
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  return async (url) => {
    const u = new URL(url);
    if (u.host === "api.openalex.org" && u.pathname === "/works") return json({ results: [work] });
    if (u.host === "api.openalex.org" && u.pathname === "/works/W2626778328") return json({ locations: [{ landing_page_url: "https://doi.org/10.65215/2q58a426" }, ...(arxivLocation ? [{ landing_page_url: "https://arxiv.org/abs/1706.03762v7" }] : [])] });
    if (u.host === "api.datacite.org" && u.pathname.toLowerCase() === "/dois/10.48550%2farxiv.1706.03762") return json(arxiv);
    if (u.host === "api.datacite.org") return json({ data: [] });
    if (u.host === "api.crossref.org" && u.pathname === "/works") return json({ status: "ok", message: { items: [] } });
    if (u.host === "doi.org") return json({ responseCode: 1 });
    return json({ message: "not found" }, 404);
  };
}

test("later copies: the arXiv original replaces a record dated by a repost; without one, the DOI is flagged", async () => {
  const withArxiv = await connect(laterCopyFetch({ arxivLocation: true }));
  const found = await call(withArxiv, "lookup_work", { id: "Attention Is All You Need, Vaswani et al., 2017" });
  assert.deepEqual([found.data.doi, found.data.year], ["10.48550/arxiv.1706.03762", 2017], "the original, not 10.65215/2q58a426");
  const checked = await call(withArxiv, "check_references", { text: "Vaswani A, Shazeer N, et al. Attention is all you need. NeurIPS 2017." });
  assert.equal(checked.data.results[0].matched?.doi ?? checked.data.results[0].suggested?.doi, "10.48550/arxiv.1706.03762");

  const without = await connect(laterCopyFetch({ arxivLocation: false }));
  const copy = await call(without, "check_references", { text: "Vaswani A, Shazeer N, et al. Attention is all you need. NeurIPS 2017." });
  assert.ok(copy.data.results[0].flags.includes("doi_may_be_later_copy"), JSON.stringify(copy.data.results[0]));
  const note = await call(without, "lookup_work", { id: "Attention Is All You Need, Vaswani et al., 2017" });
  assert.match(note.data.note, /probably a later copy/);
});
