# Web Reader: launch kit

Numbers are filled from the server's measured files (`node scripts/launch-kit.mjs web-reader`).
Post only after the release is on npm.

## Positioning

- One line: agents read web pages and PDFs as clean Markdown, and can ask a long page a question
  instead of reading all of it.
- Who it is for: everyone whose agent browses documentation, specs, papers and articles; teams
  paying for the tokens web pages burn.
- Why now: fetch tools return whole pages (navigation, footers and all) in fixed slices from the
  top, so a fact deep in a long document costs a dozen calls or gets guessed.
- Proof: main-content extraction (Firefox Reader View's), query-ranked passages, outline and
  section reads, in-page search that counts every match, PDFs; refuses private addresses at connect
  time; honours robots.txt. Tool definitions of 2,290 characters.

## Show HN

**Title:** Show HN: Web Reader, an MCP server that lets agents ask a web page a question

**Text:**

Fetch tools give agents web pages in slices from the top, so reading a long spec or manual means
paging through navigation and boilerplate until the answer turns up, or the agent gives up and
guesses. Web Reader extracts the main content (Mozilla Readability, as in Firefox's Reader View)
as clean Markdown, and adds a query mode: it ranks every passage of the page against the question
and returns only the ones that answer it, with their heading path. RFC 9110 is about 435,000
characters; the section on Content-Location comes back in 2,000.

It also gives an outline to read one section at a time, a search that returns every match with
context (and counts them), link lists with tracking parameters removed, and PDFs as text. It reads
the public web only (private and metadata addresses are refused at connect time, including via
redirects), honours robots.txt, and says who it is.

No key, MIT: https://github.com/arhancanli/web-reader-mcp. `npx -y web-reader-mcp`

## Reddit: r/LocalLLaMA, r/ClaudeAI (check each subreddit's rules first)

**Title:** A fetch MCP server that returns only the parts of a page that answer your question

**Text:** Main content as clean Markdown, query-ranked passages from long pages, outlines, in-page
search, PDFs. Refuses private addresses, honours robots.txt. Works in Claude Code, Cursor and other
MCP clients. https://github.com/arhancanli/web-reader-mcp

## Reddit: r/mcp

**Title:** Web Reader: read pages by query, section or search in 4 tools

**Text:** `find_in_page`, `page_links`, `page_outline`, `read_page`. Tool definitions 2,290 characters. `claude mcp add web-reader -- npx -y web-reader-mcp`. https://github.com/arhancanli/web-reader-mcp

## X / Bluesky thread

1. Fetch tools hand agents web pages from the top, 5,000 characters at a time. Long docs never get read to the end.
2. I built an MCP server that lets the agent ask the page: it ranks every passage and returns only the ones that answer.
3. RFC 9110 is ~435,000 characters. The Content-Location section comes back in 2,000.
4. Also outlines, section reads, in-page search, PDFs. Refuses private addresses, honours robots.txt. MIT: https://github.com/arhancanli/web-reader-mcp

## LinkedIn

Web pages are the most expensive thing an AI agent reads, and most of what it pays for is
navigation and boilerplate. I built Web Reader, an open-source MCP server that extracts a page's
main content as clean Markdown and lets the agent ask a long page a question, returning only the
passages that answer it. It reads the public web safely: private addresses refused, robots.txt
honoured. https://github.com/arhancanli/web-reader-mcp

## awesome-mcp-servers entry (Browser Automation)

- [arhancanli/web-reader-mcp](https://github.com/arhancanli/web-reader-mcp) 📇 🏠 🍎 🪟 🐧 - Reads web pages and PDFs as clean Markdown (Readability), returns only the passages that answer a query, outlines, section reads, in-page search; refuses private addresses, honours robots.txt.

## Directory blurbs

- Short: Reads web pages and PDFs as clean Markdown: main content, the sections that answer a query.
- Long: Reads a web page or PDF the way an agent needs it: the main content without navigation or ads, as clean Markdown, with an outline to jump to sections, a query mode that returns only the passages that answer a question, in-page search and link lists. Refuses private and internal addresses, respects robots.txt, no key.

## Cross-links

Footer: 14 servers, each measured before release: https://github.com/topics/arhancanli-mcp. Related: Actions Check (https://github.com/arhancanli/actions-check-mcp), Citation Check (https://github.com/arhancanli/citation-check-mcp), Domain Health (https://github.com/arhancanli/domain-health-mcp).
