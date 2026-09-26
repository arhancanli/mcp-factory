# {{title}}: launch kit

Numbers are filled from the server's measured files (`node scripts/launch-kit.mjs domain-health`).
Post only after the release is on npm.

## Positioning

- One line: tells agents why a domain's mail lands in spam and whether the domain is healthy, from
  SPF, DKIM, DMARC, DNS and the registry's own data.
- Who it is for: developers setting up transactional email (Resend, Postmark, SendGrid, SES),
  founders whose mail goes to spam, agencies and IT teams auditing client domains.
- Why now: Gmail and Yahoo require SPF, DKIM and DMARC from bulk senders, and SPF breaks silently
  at 11 DNS lookups. Reading raw TXT records does not reveal either; evaluating them does.
- Proof: SPF evaluated as RFC 7208 defines it, including a receiver's verdict for a sending IP; the
  DMARC tree walk; DKIM key sizes; RDAP from the registry. Tool definitions of {{tool_chars}}
  characters.

## Show HN

**Title:** Show HN: Domain Health, an MCP server that evaluates SPF, DKIM and DMARC like a mail server

**Text:**

When a coding agent sets up email for an app, it adds an SPF include and moves on. SPF has a limit
of 10 DNS lookups across the whole include tree; the eleventh makes every message fail SPF, and
nothing tells you. I built an MCP server that evaluates SPF the way a receiving server does (the
include tree, lookup and void-lookup counts, and for a sending IP the verdict and the mechanism that
decided it), finds DMARC by walking up the DNS tree like DMARCbis, checks DKIM keys and their size,
and reads registration data from the registry's own RDAP server.

One call, domain_report, returns everything with findings ranked and a fix for each, including
whether the domain meets Gmail's and Yahoo's bulk-sender DNS rules. It never connects to the domain
itself: DNS goes through public DNS-over-HTTPS resolvers and RDAP only to servers IANA lists.

No key, MIT: {{repo}}. `{{install}}`

## Reddit: r/sysadmin, r/emailmarketing, r/selfhosted (check each subreddit's rules first)

**Title:** Free tool for AI agents that checks SPF (including the 10-lookup limit), DKIM and DMARC

**Text:** Point it at a domain: it evaluates SPF like a mail server, finds DMARC including inherited
policies, checks DKIM key sizes, MTA-STS, TLS-RPT, BIMI, CAA and registration expiry, and ranks what
to fix. Works in Claude Code, Cursor and other MCP clients. {{repo}}

## Reddit: r/mcp

**Title:** Domain Health: SPF/DKIM/DMARC evaluation and RDAP in {{tool_count}} tools

**Text:** {{tool_names}}. Tool definitions {{tool_chars}} characters. `{{claude_code_install}}`. {{repo}}

## X / Bluesky thread

1. SPF has a limit of 10 DNS lookups across all its includes. The 11th makes every email fail SPF, silently.
2. I built an MCP server that evaluates SPF like a mail server: lookup count, void lookups, and the verdict for any sending IP.
3. Plus DMARC with inherited policies, DKIM key sizes, MTA-STS, CAA and registration expiry, ranked with fixes.
4. Free, MIT: {{repo}}

## LinkedIn

Gmail and Yahoo now require SPF, DKIM and DMARC from bulk senders, and a single extra SPF include can
break delivery without an error anywhere. I built Domain Health, an open-source MCP server that
evaluates a domain's email authentication the way receiving servers do, checks registration expiry
from the registry, and tells an AI agent exactly what to fix. {{repo}}

## awesome-mcp-servers entry (Security)

- [arhancanli/{{package}}]({{repo}}) 📇 ☁️ 🍎 🪟 🐧 - Evaluates SPF like a mail server (10-lookup limit, verdict for a sending IP), DMARC with inherited policies, DKIM key sizes, MTA-STS, TLS-RPT, BIMI, CAA, and RDAP registration and expiry, with ranked fixes.

## Directory blurbs

- Short: {{summary}}
- Long: {{description}}

## Cross-links

Footer: {{collection_size}} servers, each measured before release: {{collection_topic}}. Related: {{related}}.
