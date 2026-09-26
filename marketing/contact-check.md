# {{title}}: launch kit

Numbers are filled from the server's measured files (`node scripts/launch-kit.mjs contact-check`).
Post only after the release is on npm.

## Positioning

- One line: validates and normalises phone numbers, email addresses and postal addresses for any
  country, the way production systems do.
- Who it is for: developers building sign-up forms and checkouts with agents, anyone cleaning CRM
  or spreadsheet exports, support and operations teams writing shipping labels.
- Why now: agents check contact data by eye. Phone formats, mail domains and national address rules
  are exactly where eyes fail, and the paid lookup APIs need accounts.
- Proof: Google's libphonenumber and address data, live MX checks without sending mail, disposable
  and typo detection; up to 100 items per call. Tool definitions of {{tool_chars}} characters.

## Show HN

**Title:** Show HN: Contact Check, an MCP server that validates phones, emails and addresses

**Text:**

Agents clean contact data by guessing: is 020 7946 0958 a UK landline, does gmial.com take mail,
does a German address need a state? I built an MCP server that answers from the data production
systems use: Google's libphonenumber metadata for phone numbers (valid for their country or why
not, type, E.164), DNS for email domains (MX records, null MX, disposable providers, likely typos of
the big providers), and Google's per-country address rules (the ones behind Chrome's autofill) for
required fields, postcode patterns, states and the country's own address format.

It never sends mail and never sends the addresses anywhere; only the email's domain is looked up.

No key, MIT: {{repo}}. `{{install}}`

## Reddit: r/webdev, r/dataengineering (check each subreddit's rules first)

**Title:** Free tool for AI agents to validate phone numbers, emails and postal addresses

**Text:** libphonenumber for phones (type, E.164), DNS for emails (MX, null MX, disposable, typos),
Google's address rules for postcodes, states and formatting. Batches of up to 100. Works in Claude
Code, Cursor and other MCP clients. {{repo}}

## Reddit: r/mcp

**Title:** Contact Check: phones, emails and addresses in {{tool_count}} tools

**Text:** {{tool_names}}. Tool definitions {{tool_chars}} characters. `{{claude_code_install}}`. {{repo}}

## X / Bluesky thread

1. Is 020 7946 0958 a UK landline? Does gmial.com take mail? Does a German address need a state? Agents guess.
2. I built an MCP server that checks contact data with Google's libphonenumber, live DNS, and Google's per-country address rules.
3. Types, E.164, null MX, disposable domains, typo fixes, postcode patterns, the country's address format.
4. Free, MIT: {{repo}}

## LinkedIn

Bad contact data costs bounced mail, failed deliveries and support tickets, and AI agents now fill
a lot of forms and CRMs. I built Contact Check, an open-source MCP server that validates and
normalises phone numbers, email addresses and postal addresses for any country with the same data
production systems use, without sending a single email. {{repo}}

## awesome-mcp-servers entry (Data Science Tools)

- [arhancanli/{{package}}]({{repo}}) 📇 ☁️ 🍎 🪟 🐧 - Validates and normalises phone numbers (libphonenumber: type, E.164), email addresses (MX, null MX, disposable, typos, no mail sent) and postal addresses (Google's per-country rules, postcodes, formatting).

## Directory blurbs

- Short: {{summary}}
- Long: {{description}}

## Cross-links

Footer: {{collection_size}} servers, each measured before release: {{collection_topic}}. Related: {{related}}.
