# Internet Standards: launch kit

Numbers are filled from the server's measured files (`node scripts/launch-kit.mjs internet-standards`).
Post only after the release is on npm.

## Positioning

- One line: RFCs and IANA registries for coding agents: exact section text, what is current and what
  replaced it, errata, and registered values.
- Who it is for: anyone who has an agent implement or review protocols, APIs, HTTP servers and
  clients, parsers, TLS or DNS code.
- Why now: models quote obsolete RFCs from memory (RFC 2616 for HTTP/1.1 was replaced twice), and
  getting a status code, header or media type registration wrong ships bugs.
- Proof: follows obsoleted-by chains to today's documents (RFC 2616 to RFCs 9110, 9111 and 9112),
  returns sections verbatim with their verified errata, covers nine IANA registries. Tool
  definitions of 2,119 characters against 3,643 for rfcxml-mcp, the most active RFC server
  (42% smaller).

## Show HN

**Title:** Show HN: Internet Standards, an MCP server that stops agents quoting obsolete RFCs

**Text:**

Ask a model about HTTP/1.1 and it quotes RFC 2616, which was replaced in 2014 and again in 2022. I
built an MCP server that gives agents the RFCs and IANA registries directly from the RFC Editor and
IANA:

- `rfc_info` says whether an RFC is current and follows obsoleted-by chains to the documents that
  replace it today; it also resolves BCP/STD numbers and draft names.
- `rfc_section` returns a section's exact text (page footers and headers stripped from old
  paginated RFCs) with the verified errata filed against it, and warns when the RFC is obsolete.
- `iana_lookup` covers HTTP status codes, fields and methods, media types, URI schemes, ports, TLS
  cipher suites, link relations and DNS record types, with the defining RFC section.

Per-RFC lookups use the RFC Editor's small records; the 13.7 MB index and 11.7 MB errata export
are fetched compressed once and kept parsed in memory. No key, MIT.

Install: `npx -y internet-standards-mcp`, or `claude mcp add internet-standards -- npx -y internet-standards-mcp`. Code: https://github.com/arhancanli/internet-standards-mcp

## Reddit: r/programming, r/networking, r/webdev

**Title:** I built a tool that lets AI coding agents read the actual RFCs (and tells them when an RFC is obsolete)

**Text:** It's an MCP server for Claude Code, Cursor and others. It returns exact RFC section text
with its errata, says what replaced an obsolete RFC, and looks up IANA registries (status codes,
headers, media types, ports, cipher suites). Free: https://github.com/arhancanli/internet-standards-mcp

## Reddit: r/mcp

**Title:** Internet Standards: RFC sections, obsolescence chains, errata and IANA registries in 4 tools

**Text:** `iana_lookup`, `rfc_info`, `rfc_section`, `search_rfcs`. Tool definitions are 2,119 characters. `claude mcp add internet-standards -- npx -y internet-standards-mcp`. https://github.com/arhancanli/internet-standards-mcp

## X / Bluesky thread

1. LLMs still cite RFC 2616 for HTTP/1.1. It was replaced in 2014, then again in 2022.
2. I built an MCP server that follows obsoleted-by chains to today's RFCs and returns exact section
   text with the verified errata.
3. Plus nine IANA registries: status codes, headers, media types, ports, TLS cipher suites, DNS.
4. Free, MIT: https://github.com/arhancanli/internet-standards-mcp

## LinkedIn

Coding agents implement protocols from memory, and their memory is full of obsolete RFCs. I built
Internet Standards, an open-source MCP server that gives agents the current standards from the RFC
Editor and IANA: exact section text with errata, what replaced an obsolete RFC, and registered
values from nine IANA registries. https://github.com/arhancanli/internet-standards-mcp

## awesome-mcp-servers entry (Developer Tools)

- [arhancanli/internet-standards-mcp](https://github.com/arhancanli/internet-standards-mcp) 📇 🏠 🍎 🪟 🐧 - RFCs and IANA registries for agents: exact section text with errata, obsoleted-by chains to the current RFCs, BCP/STD and draft resolution, and nine IANA registries.

## Directory blurbs

- Short: RFC sections, status, obsoleted-by chains, errata and IANA registries for coding agents.
- Long: RFCs, errata and IANA registries for coding agents: exact section text, status and obsoleted-by chains to the current replacement, errata per section, and protocol registry entries with their defining references.

## Cross-links

Footer: 8 servers, each measured before release: https://github.com/topics/arhancanli-mcp. Related: Citation Check (https://github.com/arhancanli/citation-check-mcp), Drug Label (https://github.com/arhancanli/drug-label-mcp), End of Life (https://github.com/arhancanli/end-of-life-mcp).
