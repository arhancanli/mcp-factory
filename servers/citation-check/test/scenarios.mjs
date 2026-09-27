// The calls the golden tests replay and scripts/perf.mjs times. test/record.mjs runs them against
// the live sources and stores every response in test/fixtures/sources.json.
export const REFERENCE_LIST = `1. Wakefield AJ, Murch SH, Anthony A, et al. Ileal-lymphoid-nodular hyperplasia, non-specific colitis, and pervasive developmental disorder in children. Lancet. 1998;351(9103):637-641.
2. Kucsko G, Maurer PC, Yao NY, et al. Nanometre-scale thermometry in a living cell. Nature. 2013;500:54-58. doi:10.1038/nature12373
3. Vaswani A, Shazeer N, Parmar N, et al. Attention is all you need. In: Advances in Neural Information Processing Systems. 2017.
4. Smith J, Doe R. Quantum entanglement improves photosynthesis yields in wheat. Nature Plants. 2021;7:112-119. doi:10.1038/nature12373
5. Kucsko G, Maurer PC. Nanometre-scale thermometry in a living cell. Nature. 2011;500:54-58.
6. Chen L, Okafor B. Neural cartography of hallucinated citations in legal briefs. Journal of Imaginary Studies. 2022;14(2):33-47.`;

export const BIBTEX = `@article{kucsko2013,
  author = {Kucsko, G. and Maurer, P. C. and Yao, N. Y.},
  title = {Nanometre-scale thermometry in a living cell},
  journal = {Nature}, year = {2013}, volume = {500}, pages = {54--58}
}
@article{fake2020,
  author = {Nguyen, Thanh and Rossi, Maria},
  title = {Mitochondrial resonance imaging predicts tomato ripening},
  journal = {Cell}, year = {2020}, doi = {10.1016/j.cell.2020.99.001}
}`;

export const RETRACTION_DOIS = ["10.1126/science.1197258", "10.1038/nature12373", "10.1016/S0140-6736(97)11096-0", "not a doi", "10.48550/arxiv.1706.03762"];

export const SCENARIOS = [
  { label: "check_references: 6 citations (retracted, invented, wrong year, borrowed DOI, arXiv-only)", tool: "check_references", args: { text: REFERENCE_LIST }, example: true },
  { label: "check_references: 2 BibTeX entries with corrected BibTeX", tool: "check_references", args: { text: BIBTEX, bibtex: true } },
  { label: "lookup_work: arXiv id", tool: "lookup_work", args: { id: "arXiv:1706.03762v5" } },
  { label: "lookup_work: PMID of a retracted paper", tool: "lookup_work", args: { id: "PMID: 9500320" } },
  { label: "lookup_work: DOI link", tool: "lookup_work", args: { id: "https://doi.org/10.1126/science.1197258" } },
  { label: "check_retractions: 5 inputs", tool: "check_retractions", args: { dois: RETRACTION_DOIS } },
  { label: "lookup_work: a 2017 paper the indexes also file under a later repost's DOI", tool: "lookup_work", args: { id: "Attention Is All You Need, Vaswani et al., 2017" } },
  { label: "lookup_work: a famous paper's title plus search words", tool: "lookup_work", args: { id: "A Bacterium That Can Grow by Using Arsenic Instead of Phosphorus Science 2011 retraction notice" } },
  { label: "lookup_work: invented DOI", tool: "lookup_work", args: { id: "10.9999/this-doi-does-not-exist-xyz" }, expectError: true },
];
