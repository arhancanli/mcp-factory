# Regex Check: launch kit

Numbers are filled from the server's measured files (`node scripts/launch-kit.mjs regex-check`).
Post only after the release is on npm.

## Positioning

- One line: runs regular expressions on the real JavaScript, Python, PCRE2 and RE2 engines and shows
  where they disagree, plus a ReDoS check that is measured, not guessed.
- Who it is for: developers whose agents write validation, parsing and log-matching patterns, and
  security reviewers checking patterns that run on untrusted input.
- Why now: agents write one regex and ship it to whichever engine the code runs on; the engines
  differ on syntax (named groups, lookbehind), meaning (\d, \w, $) and speed (backtracking).
- Proof: four real engines (V8, CPython through Pyodide, PCRE2 10.48, RE2) in one call, positions
  normalised to characters, differences listed, catastrophic backtracking proven with an attack
  string and timed on each engine. Offline. Tool definitions of 1,490 characters.

## Show HN

**Title:** Show HN: Regex Check, an MCP server that runs a regex on four real engines

**Text:**

A regex that works in JavaScript can fail to compile in Go (no lookbehind), match different text in
Python (\d includes Arabic-Indic digits, $ matches before a trailing newline) or hang a server on one
crafted input. Coding agents write regexes as if there were one engine.

I built an MCP server that runs the pattern on the real engines in process: V8, CPython's re through
Pyodide, PCRE2 10.48 and RE2, all in WebAssembly except V8. Each returns its compile error with
position or its matches with groups, and replacements in its own syntax; the report lists where the
engines disagree. A second tool checks for ReDoS with recheck, which builds an attack string, and then
times that attack on each engine (JavaScript and Python hang on ^(a+)+$; PCRE2's optimisations defuse
it; RE2 is linear). Each engine runs in its own worker thread with a time limit.

MIT: https://github.com/arhancanli/regex-check-mcp. `npx -y regex-check-mcp`

## Reddit: r/regex, r/programming (check each subreddit's rules first)

**Title:** Free tool that runs one regex on JavaScript, Python, PCRE2 and RE2 and shows the differences

**Text:** Real engines, not emulation: compile errors with position, matches and groups, replacements,
plus a measured ReDoS check. Works in Claude Code, Cursor and other MCP clients. https://github.com/arhancanli/regex-check-mcp

## Reddit: r/mcp

**Title:** Regex Check: four real regex engines in 2 tools

**Text:** `check_redos`, `test_regex`. Tool definitions 1,490 characters. `claude mcp add regex-check -- npx -y regex-check-mcp`. https://github.com/arhancanli/regex-check-mcp

## X / Bluesky thread

1. ^abc$ matches "abc\n" in Python and PHP. Not in JavaScript or Go. \d matches Arabic-Indic digits in Python only.
2. I built an MCP server that runs a regex on the real engines: V8, CPython, PCRE2 and RE2, side by side.
3. Plus a ReDoS check that builds an attack string and times it on each engine.
4. Free, MIT, offline: https://github.com/arhancanli/regex-check-mcp

## LinkedIn

Regular expressions are small enough to write from memory and different enough between engines to
break quietly, or to hang a service on one crafted input. I built Regex Check, an open-source MCP
server that runs a pattern on the real JavaScript, Python, PCRE2 and RE2 engines and proves or rules
out catastrophic backtracking before the pattern ships. https://github.com/arhancanli/regex-check-mcp

## awesome-mcp-servers entry (Developer Tools)

- [arhancanli/regex-check-mcp](https://github.com/arhancanli/regex-check-mcp) 📇 🏠 🍎 🪟 🐧 - Runs a regex on four real engines (V8, CPython re via Pyodide, PCRE2, RE2) with matches, groups, replacements and the differences between them; ReDoS check with an attack string timed on each engine. Offline.

## Directory blurbs

- Short: Tests regexes on real engines: JavaScript, Python, PCRE2, RE2 (Go). Matches, groups, ReDoS.
- Long: Tests regular expressions on the real engines, in process: JavaScript (V8), Python (CPython's re, via Pyodide), PCRE2 10.48 (PHP, grep -P, nginx) and RE2 (Go, BigQuery). Each engine gives its own verdict: compile errors with position, every match with its groups and named groups, and the result of a replacement; differences between engines are listed. Finds catastrophic backtracking (ReDoS) with an attack string and confirms it by timing the backtracking engines. Offline, no key.

## Cross-links

Footer: 21 servers, each measured before release: https://github.com/topics/arhancanli-mcp. Related: Actions Check (https://github.com/arhancanli/actions-check-mcp), Citation Check (https://github.com/arhancanli/citation-check-mcp), Config Check (https://github.com/arhancanli/config-check-mcp).
