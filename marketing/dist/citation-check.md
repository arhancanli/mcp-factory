# Citation Check: launch kit

Numbers are filled from the server's measured files (`node scripts/launch-kit.mjs citation-check`).
Post only after the release is on npm.

## Positioning

- One line: check every reference before anyone relies on it: does it exist, is it cited correctly,
  has it been retracted.
- Who it is for: researchers, students, lawyers and editors who draft with AI, and anyone building an
  agent that writes with citations.
- Why now: fabricated references are reaching court filings and journal submissions; Damien
  Charlotin's database of AI-hallucination cases in courts lists more than two thousand decisions.
- Proof: catches invented papers, wrong years and authors, real DOIs attached to fake papers, and
  retractions (from Crossref, including Retraction Watch). Tool definitions of 1,523
  characters against 2,550 for doi-mcp, the most starred citation verifier (40% smaller).

## Show HN

**Title:** Show HN: Citation Check, an MCP server that catches fabricated and retracted references

**Text:**

AI-drafted papers and briefs keep citing papers that do not exist, or real DOIs attached to made-up
titles. I built an MCP server that checks a whole reference list or BibTeX file and gives each
reference a verdict: verified, mismatch (a field is wrong, or the DOI belongs to another paper),
not_found (possibly fabricated) or unverifiable. It also flags retractions, corrections and
expressions of concern, with the notice DOIs and dates, from Crossref's copy of the Retraction Watch
database.

The part that took the most care is choosing the right record. Crossref ranks a same-titled letter
above the famous retracted Wakefield paper, and both Crossref and OpenAlex rank a 2025 repost of
"Attention Is All You Need" above the 2017 original. Citation Check compares title, first author and
year itself and falls back through DataCite (where arXiv lives) and OpenAlex, so both come out right.

It returns corrected BibTeX that keeps your citation keys. It follows each source's published
rate limits, needs no key, and is MIT licensed.

Install: `npx -y citation-check-mcp`, or `claude mcp add citation-check -- npx -y citation-check-mcp` in Claude Code. Code: https://github.com/arhancanli/citation-check-mcp

I'd especially like reference lists where it gets the verdict wrong.

## Reddit: r/academia, r/PhD, r/LaTeX

**Title:** I built a free tool that checks a bibliography for fabricated, mis-cited and retracted references

**Text:** It's an MCP server, so it runs inside Claude, Cursor and other AI tools: paste a reference
list or a .bib file and ask it to check. Each reference comes back verified, mismatch (with the
wrong field), not_found or unverifiable, with retractions flagged, and you can get corrected BibTeX
with DOIs added. Free, no account: https://github.com/arhancanli/citation-check-mcp

## Reddit: r/mcp and r/ClaudeAI

**Title:** Citation Check: verify references and catch retractions from inside Claude or Cursor

**Text:** 3 tools (`check_references`, `check_retractions`, `lookup_work`). Handles Vancouver, APA, numbered lists and BibTeX;
batches DOIs 40 at a time; picks the original paper over same-titled letters and reposts. Tool
definitions are 1,523 characters. `claude mcp add citation-check -- npx -y citation-check-mcp`. https://github.com/arhancanli/citation-check-mcp

## X / Bluesky thread

1. AI-written papers and legal briefs keep citing papers that don't exist. I built a free checker you
   can run inside Claude or Cursor.
2. Paste a reference list or .bib file. Each reference: verified, mismatch, not_found, or
   unverifiable, plus retraction and correction flags with the notice DOIs.
3. It catches the sneaky case too: a real DOI attached to an invented title.
4. MIT, no key: https://github.com/arhancanli/citation-check-mcp

## LinkedIn

Fabricated references have moved from embarrassing to sanctionable: courts have now ruled on more
than two thousand filings with AI-hallucinated material. I built Citation Check, an open-source
checker that runs inside AI assistants and verifies every reference in a document against Crossref,
DataCite, PubMed and OpenAlex, flags retracted work, and returns corrected BibTeX. Free to use:
https://github.com/arhancanli/citation-check-mcp

## awesome-mcp-servers entry (Research)

- [arhancanli/citation-check-mcp](https://github.com/arhancanli/citation-check-mcp) 📇 🏠 🍎 🪟 🐧 - Verifies reference lists and BibTeX against Crossref, DataCite, PubMed and OpenAlex: flags fabricated, mis-cited and retracted references, returns corrected BibTeX.

## Directory blurbs

- Short: Verifies citations: finds fabricated or mismatched references and retractions, returns clean BibTeX.
- Long: Checks reference lists and BibTeX against Crossref, OpenAlex, arXiv, PubMed and DataCite: flags fabricated or mismatched citations field by field, flags retractions, and returns corrected BibTeX with DOIs. Verdicts: verified, mismatch, not_found, unverifiable; flags retractions,
  corrections and expressions of concern (Crossref, including Retraction Watch). No key.

## Cross-links

Footer for every post: 8 servers, each measured before release:
https://github.com/topics/arhancanli-mcp. Related: Drug Label (https://github.com/arhancanli/drug-label-mcp), End of Life (https://github.com/arhancanli/end-of-life-mcp), Internet Standards (https://github.com/arhancanli/internet-standards-mcp).
