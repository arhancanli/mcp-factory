# Drug Label: launch kit

Numbers are filled from the server's measured files (`node scripts/launch-kit.mjs drug-label`).
Post only after the release is on npm. Keep every post's framing: label information, not medical
advice.

## Positioning

- One line: medication answers from the official FDA label, in its own words, citing the exact label.
- Who it is for: health-app builders, pharmacists and clinicians who use AI assistants, researchers,
  and anyone who wants an agent to stop answering drug questions from memory.
- Why now: NLM retired its free drug-interaction API in 2024 and nothing free replaced it; models
  answer from outdated memory; common generics have hundreds of labels, most of them repackaged
  copies.
- Proof: picks manufacturers' labels (the brand's NDA first), refuses to guess between look-alike
  names, returns boxed warnings, contraindications and interaction sections verbatim with set id,
  version and date. Tool definitions of 1,958 characters against 23,915
  for @ythalorossy/openfda, the most downloaded openFDA server (92% smaller).

## Show HN

**Title:** Show HN: Drug Label, an MCP server that answers from the official FDA label, not memory

**Text:**

Ask a model about a drug's warnings and it answers from training data. I built an MCP server that
reads the current FDA label instead and cites exactly which label it used.

The hard part is choosing the label. Metformin has over 500 labels on DailyMed, mostly repackaged
copies that are relabelled often. Drug Label takes candidates from openFDA's NDC directory, keeps
original packagers only, ranks the brand's NDA label first, and reads the text from DailyMed. It
also refuses to auto-correct a misspelling when two drug names are equally close, because look-alike
names are a known cause of medication errors.

Tools: find_drug (RxNorm names, brands, NDCs, classes), label_section (boxed warning, interactions,
contraindications and more, verbatim), search_label (every mention of grapefruit, alcohol or another
drug), recalls_shortages (openFDA).

It's label information, not medical advice. No key, MIT: https://github.com/arhancanli/drug-label-mcp. `npx -y drug-label-mcp`

## Reddit: r/pharmacy, r/medicine (read each subreddit's self-promotion rules first)

**Title:** A free tool that makes AI assistants quote the actual FDA label (and say which one)

**Text:** It's an MCP server for Claude, Cursor and similar tools. Ask about a drug and it returns the
label's own text for the section you want, with the manufacturer, version and date, and it won't
guess between look-alike names. Label information only, not advice. Open source: https://github.com/arhancanli/drug-label-mcp

## Reddit: r/mcp and r/ClaudeAI

**Title:** Drug Label: FDA label sections, interactions, recalls and shortages with citations

**Text:** 4 tools (`find_drug`, `label_section`, `recalls_shortages`, `search_label`). Tool definitions 1,958 characters versus
23,915 for the most downloaded openFDA server. `claude mcp add drug-label -- npx -y drug-label-mcp`. https://github.com/arhancanli/drug-label-mcp

## X / Bluesky thread

1. Metformin has 500+ labels on DailyMed. Most are repackaged copies. Which one should an AI quote?
2. I built Drug Label: it picks manufacturers' labels (brand NDA first) and quotes the section you ask
   for, citing set id, version and date.
3. It refuses to guess between look-alike drug names. Label information, not medical advice.
4. Free, MIT: https://github.com/arhancanli/drug-label-mcp

## LinkedIn

AI assistants answer medication questions from memory. I built Drug Label, an open-source MCP server
that answers from the current official FDA label instead, quotes it verbatim, and cites exactly which
label and version it used, with recalls and shortages from openFDA. It is careful where mistakes are
costly: no silent spelling corrections between look-alike drugs, and explicit answers when a label
has no such section. https://github.com/arhancanli/drug-label-mcp

## awesome-mcp-servers entry (Health / Biology)

- [arhancanli/drug-label-mcp](https://github.com/arhancanli/drug-label-mcp) 📇 🏠 🍎 🪟 🐧 - Official FDA label sections verbatim with the label cited (DailyMed), drug name resolution (RxNorm), recalls and shortages (openFDA); picks manufacturers' labels over repackagers.

## Directory blurbs

- Short: FDA drug label answers with section citations, RxNorm name resolution, recalls and shortages.
- Long: Answers medication questions from the official FDA label text on DailyMed with section-level citations (boxed warning, indications, contraindications, warnings, interactions, pregnancy, dosing), resolves any drug name or NDC through RxNorm, and reports openFDA recalls and shortages.

## Cross-links

Footer: 13 servers, each measured before release: https://github.com/topics/arhancanli-mcp. Related: Citation Check (https://github.com/arhancanli/citation-check-mcp), Domain Health (https://github.com/arhancanli/domain-health-mcp), End of Life (https://github.com/arhancanli/end-of-life-mcp).
