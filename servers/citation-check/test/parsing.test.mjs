// Parsing and matching on synthetic inputs, one rule per test.
import assert from "node:assert/strict";
import test from "node:test";
import { cleanDoi, findArxiv, findDoi, findPmid, findYears } from "../src/ids.mjs";
import { latexToText, parseBibtex, parseNames, toBibtex } from "../src/bibtex.mjs";
import { compare, fromBibtex, fromText, rank } from "../src/match.mjs";
import { pick, splitReferences } from "../src/check.mjs";
import { flagForUpdate, fromCrossref, limits } from "../src/sources.mjs";
import { createContext } from "../src/server.mjs";

test("DOIs: links, prefixes, sentence punctuation and balanced brackets", () => {
  assert.equal(findDoi("see https://doi.org/10.1038/nature12373."), "10.1038/nature12373");
  assert.equal(findDoi("doi:10.1016/S0140-6736(97)11096-0;"), "10.1016/s0140-6736(97)11096-0", "keeps its own brackets");
  assert.equal(findDoi("(Smith 2020, doi:10.1000/xyz123)."), "10.1000/xyz123", "drops the sentence's bracket");
  assert.equal(findDoi("see doi:10.1000/abc(1)."), "10.1000/abc(1)", "keeps a bracket the DOI itself ends with");
  assert.equal(cleanDoi("https://dx.doi.org/10.1000%2Fabc"), "10.1000/abc");
  assert.equal(cleanDoi("not a doi"), null);
});

test("arXiv ids only when the text says arXiv; PMIDs; years", () => {
  assert.equal(findArxiv("arXiv:1706.03762v5"), "1706.03762");
  assert.equal(findArxiv("https://arxiv.org/abs/2303.08774"), "2303.08774");
  assert.equal(findArxiv("arXiv:hep-th/9901001"), "hep-th/9901001");
  assert.equal(findArxiv("Volume 1706.03762 of something"), null);
  assert.equal(findPmid("PMID: 9500320"), "9500320");
  assert.equal(findPmid("https://pubmed.ncbi.nlm.nih.gov/9500320/"), "9500320");
  assert.deepEqual(findYears("Lancet. 1998;351(9103):637-641. Retracted 2010.", new Date("2026-01-01")), [1998, 2010]);
  assert.deepEqual(findYears("pages 2099-3000", new Date("2026-01-01")), [], "future years are page numbers, not years");
});

test("first author from every common citation style", () => {
  assert.equal(fromText("Vaswani A, Shazeer N. Attention is all you need.").firstFamily, "Vaswani");
  assert.equal(fromText("Vaswani, A., Shazeer, N. (2017). Attention is all you need.").firstFamily, "Vaswani");
  assert.equal(fromText("A. Vaswani, N. Shazeer, Attention is all you need").firstFamily, "Vaswani");
  assert.equal(fromText("[3] van der Maaten L, Hinton G. Visualizing data using t-SNE.").firstFamily, "van der Maaten");
  assert.equal(fromText('Smith J. "A quoted title that is long enough". Journal. 2020.').title, "A quoted title that is long enough");
  assert.equal(fromText("Doe, J. (2020). An APA style title here. Journal of Things, 3(1), 1-2.").title, "An APA style title here");
});

test("BibTeX: macros, concatenation, LaTeX accents, braces and 'and others'", () => {
  const [e] = parseBibtex('@string{nat = "Nature"}\n@article{k1, title = {Schr{\\"o}dinger\'s {Cat}}, journal = nat # " Physics", author = {M{\\"u}ller, J{\\"o}rg and {World Health Organization} and others}, year = 2020}');
  assert.equal(e.key, "k1");
  assert.equal(latexToText(e.fields.title), "Schrödinger's Cat");
  assert.equal(e.fields.journal, "Nature Physics");
  const { names, etal } = parseNames(e.fields.author);
  assert.deepEqual(names, [{ family: "Müller", given: "Jörg" }, { family: "World Health Organization", given: "", org: true }]);
  assert.equal(etal, true);
  const c = fromBibtex(e);
  assert.equal(c.firstFamily, "Müller");
  assert.deepEqual(c.years, [2020]);
});

test("BibTeX out: escaped specials, en dash pages, organisation authors braced", () => {
  const bib = toBibtex({ kind: "article", title: "Costs & benefits: 50% of $x_1$", authors: [{ family: "World Health Organization", given: "", org: true }], year: 2020, pages: "10-20", doi: "10.1/x" }, "who2020");
  assert.match(bib, /^@article\{who2020,/);
  assert.match(bib, /author = \{\{World Health Organization\}\}/);
  assert.match(bib, /title = \{Costs \\& benefits: 50\\% of \\\$x\\_1\\\$\}/);
  assert.match(bib, /pages = \{10--20\}/);
});

test("splitting: numbered lists with wrapped lines, paragraphs, single lines, BibTeX", () => {
  assert.equal(splitReferences("[1] Author A. Title one. 2020.\ncontinued here\n[2] Author B. Title two. 2021.").length, 2);
  assert.equal(splitReferences("Author A. Title one is here. 2020.\n\nAuthor B. Title two is here.\n2021.").length, 2);
  assert.equal(splitReferences("Author A. Title one is here. 2020.\nAuthor B. Title two is here. 2021.").length, 2);
  assert.equal(splitReferences("@article{a, title={T}}\n@book{b, title={U}}").length, 2);
});

const record = (o) => ({ title: "Nanometre-scale thermometry in a living cell", authors: [{ family: "Kucsko", given: "G" }], years: [2013], ...o });

test("compare: title decides identity; author and year decide accuracy; short titles cannot decide alone", () => {
  const good = compare(fromText("Kucsko G, Maurer PC. Nanometre-scale thermometry in a living cell. Nature. 2013."), record());
  assert.ok(good.title >= 0.85);
  assert.equal(good.author, true);
  assert.equal(good.year, true);
  const online = compare(fromText("Kucsko G. Nanometre-scale thermometry in a living cell. Nature. 2012."), record());
  assert.equal(online.year, true, "one year apart is online-first versus print");
  const wrong = compare(fromText("Smith J. Nanometre-scale thermometry in a living cell. Nature. 2019."), record());
  assert.equal(wrong.author, false);
  assert.equal(wrong.year, false);
  const short = compare(fromText("Anyone. Nature. 2013."), record({ title: "Nature" }));
  assert.ok(short.title <= 0.7);
});

test("rank: a same-titled comment or reply loses to the original", () => {
  const c = fromText("Kucsko G. Nanometre-scale thermometry in a living cell. Nature. 2013.");
  const original = rank(c, record(), 1).score;
  const reply = rank(c, record({ title: "Reply to: Nanometre-scale thermometry in a living cell", authors: [{ family: "Other" }] }), 0).score;
  assert.ok(original > reply);
  // Same authors, same year, listed first by the source: only the notice-title rule separates them.
  const correction = rank(c, record({ title: "Author correction: Nanometre-scale thermometry in a living cell" }), 0).score;
  assert.ok(original > correction, "an author correction by the same authors loses to the paper it corrects");
});

test("Crossref updates map to flags; unknown update types are ignored", () => {
  assert.equal(flagForUpdate("retraction"), "retracted");
  assert.equal(flagForUpdate("expression_of_concern"), "expression_of_concern");
  assert.equal(flagForUpdate("partial_retraction"), "partially_retracted");
  assert.equal(flagForUpdate("new_edition"), undefined);
  const r = fromCrossref({ DOI: "10.1/X", title: ["<i>T</i> x"], author: [{ name: "Consortium" }], issued: { "date-parts": [[2020]] }, type: "journal-article", "updated-by": [{ type: "retraction", DOI: "10.1/R" }, { type: "retraction", DOI: "10.1/r" }] });
  assert.equal(r.title, "T x");
  assert.deepEqual(r.authors, [{ family: "Consortium", given: "", org: true }]);
  assert.equal(r.updates.length, 1, "a notice listed twice is kept once");
});

test("Crossref pools: public by default, polite only with a valid CROSSREF_MAILTO", () => {
  assert.equal(limits().find((l) => l.host === "api.crossref.org" && !l.path).perSecond, 1);
  assert.equal(limits({ polite: true }).find((l) => l.host === "api.crossref.org" && !l.path).perSecond, 3);
  assert.equal(createContext({ env: { CROSSREF_MAILTO: "me@example.org" } }).mailto, "&mailto=me%40example.org");
  assert.equal(createContext({ env: { CROSSREF_MAILTO: "not an email" } }).mailto, "");
  assert.equal(createContext({ env: {} }).mailto, "");
});

test("pick: a reply or correction is never taken as the cited work, even when it is the only candidate", () => {
  const c = fromText("Kucsko G. Nanometre-scale thermometry in a living cell. Nature. 2013.");
  const letter = record({ title: "Re: Nanometre-scale thermometry in a living cell" });
  assert.equal(pick(c, [letter]), null);
  assert.equal(pick(c, [letter, record()]).r.title, "Nanometre-scale thermometry in a living cell");
  const citesNotice = fromText("Editors. Retraction note: Nanometre-scale thermometry in a living cell. Nature. 2014.");
  assert.ok(pick(citesNotice, [record({ title: "Retraction note: Nanometre-scale thermometry in a living cell", years: [2014], authors: [] })]), "a citation of the notice itself can match the notice");
});
