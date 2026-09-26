# License Check: launch kit

Numbers are filled from the server's measured files (`node scripts/launch-kit.mjs license-check`).
Post only after the release is on npm.

## Positioning

- One line: tells agents whether a dependency's license fits your project, from OSADL's compatibility
  matrix and the SPDX list, with the reason.
- Who it is for: developers and teams letting agents add dependencies, companies shipping
  proprietary software, open source maintainers choosing licenses.
- Why now: agents add packages all day and answer license questions from memory, which blurs the
  cases that matter (Apache-2.0 into GPL-2.0-only is not allowed; into GPL-3.0 it is).
- Proof: OSADL verdicts with explanations for any SPDX expression, a proprietary mode by copyleft
  class, dependency lists checked in one call. Tool definitions of 1,720 characters.

## Show HN

**Title:** Show HN: License Check, an MCP server that answers "can I use this dependency?"

**Text:**

Coding agents add dependencies constantly and are asked whether the licenses are fine; they answer
from memory. I built an MCP server that answers from OSADL's open source license compatibility
matrix (119 licenses, a reason for every pair) and the SPDX License List: give it your project's
license and the licenses or SPDX expressions of what you want to include, and each gets yes, no, or
check (it depends on how the code is combined), with the reason. OR expressions take the option
that works, AND needs every part, linking exceptions are taken into account, and a proprietary
project is judged by copyleft class.

It also looks up the declared licenses of whole dependency lists (npm, PyPI, crates.io, Go, Maven,
NuGet) through deps.dev and checks them in one call. Information, not legal advice.

No key, MIT: https://github.com/arhancanli/license-check-mcp. `npx -y license-check-mcp`

## Reddit: r/opensource, r/programming (check each subreddit's rules first)

**Title:** Free tool for AI agents: license compatibility from OSADL's matrix, for any SPDX expression

**Text:** Your license plus the licenses of what you include; each gets yes, no or check with OSADL's
reason. Proprietary mode, dependency lists via deps.dev. Works in Claude Code, Cursor and other MCP
clients. https://github.com/arhancanli/license-check-mcp

## Reddit: r/mcp

**Title:** License Check: SPDX and OSADL compatibility in 3 tools

**Text:** `check_compatibility`, `license_info`, `package_licenses`. Tool definitions 1,720 characters. `claude mcp add license-check -- npx -y license-check-mcp`. https://github.com/arhancanli/license-check-mcp

## X / Bluesky thread

1. Can Apache-2.0 code go into a GPL-2.0-only project? No. Into GPL-3.0? Yes. Agents mix these up.
2. I built an MCP server that answers from OSADL's license compatibility matrix, with the reason, for any SPDX expression.
3. Proprietary mode by copyleft class, and whole dependency lists checked through deps.dev.
4. Free, MIT: https://github.com/arhancanli/license-check-mcp

## LinkedIn

Every dependency an AI agent adds comes with a license, and agents judge them from memory. I built
License Check, an open-source MCP server that checks compatibility against OSADL's matrix with the
reason for each verdict, identifies licenses however they are written, and checks whole dependency
lists in one call. Information, not legal advice, but grounded in the data compliance teams use.
https://github.com/arhancanli/license-check-mcp

## awesome-mcp-servers entry (Developer Tools)

- [arhancanli/license-check-mcp](https://github.com/arhancanli/license-check-mcp) 📇 ☁️ 🍎 🪟 🐧 - License compatibility from OSADL's matrix for any SPDX expression (with reasons), proprietary mode by copyleft class, SPDX identification, and dependency license checks via deps.dev.

## Directory blurbs

- Short: Open source license answers: SPDX ids, copyleft, and whether a dependency's license fits yours.
- Long: Answers open source license questions from authoritative data: the SPDX identifier for any way a license is written, whether it is OSI approved and copyleft, and whether a dependency's license can be combined with your project's (OSADL's compatibility matrix, with the reason), for SPDX expressions with OR, AND and exceptions, and for whole dependency lists via deps.dev. Not legal advice. No key.

## Cross-links

Footer: 13 servers, each measured before release: https://github.com/topics/arhancanli-mcp. Related: Citation Check (https://github.com/arhancanli/citation-check-mcp), Domain Health (https://github.com/arhancanli/domain-health-mcp), Drug Label (https://github.com/arhancanli/drug-label-mcp).
