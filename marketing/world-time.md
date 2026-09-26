# {{title}}: launch kit

Numbers are filled from the server's measured files (`node scripts/launch-kit.mjs world-time`).
Post only after the release is on npm.

## Positioning

- One line: time zones, daylight saving, holidays and business days, answered by tools instead of
  from a model's memory.
- Who it is for: anyone whose agent schedules meetings, quotes deadlines ("10 business days"), plans
  across countries, or writes dates into documents.
- Why now: models do date arithmetic from memory and get the edges wrong: the weeks when the US and
  Europe have changed clocks on different dates, times that daylight saving skips, holidays, and
  weekends that are not Saturday and Sunday. The official reference time server converts times for
  today only and knows nothing about holidays or business days.
- Proof: {{tool_count}} tools, offline, answers in milliseconds; holiday rules for 207 countries and
  their states; DST gaps and repeats flagged rather than guessed. Benchmark numbers are in the README.

## Show HN

**Title:** Show HN: World Time, an MCP server for time zones, holidays and business days

**Text:**

Agents are bad at dates. In my benchmark, a model using the official reference time server said
that 18:00 on 31 December in Los Angeles is 15:00 on 2 January in Auckland (it is 1 January), and
put 10 business days after 18 December in England on the 5th of January (Boxing Day's substitute
makes it the 6th). That server converts times for today only and knows no holidays.

I built an MCP server that answers these from data: the time zone database in Node for conversions
(including flagging local times that a daylight-saving change skips or repeats), holiday rules for
207 countries and their states for holidays and business days, each country's own weekend from
Unicode CLDR, and a meeting finder that respects everyone's working hours and holidays. Places can be
written the way people write them: "Portland, Maine", "Munich", "PST", "UTC+5:30".

It runs entirely offline, so every call is a few milliseconds and costs no API quota. Islamic-calendar
holidays are marked as estimates, because the official day follows a moon sighting.

MIT: {{repo}}. `{{install}}`

## Reddit: r/LocalLLaMA, r/ClaudeAI (check each subreddit's rules first)

**Title:** An MCP server so your agent stops getting time zones, DST and holidays wrong

**Text:** Offline tools for the time anywhere, DST-safe conversions, public holidays (207 countries),
business-day math with each country's weekend, and meeting slots across zones. Works in Claude
Code, Cursor and other MCP clients. {{repo}}

## Reddit: r/mcp

**Title:** World Time: {{tool_count}} offline tools for time zones, holidays and business days

**Text:** {{tool_names}}. Tool definitions {{tool_chars}} characters. `{{claude_code_install}}`. {{repo}}

## X / Bluesky thread

1. 18:00 on Dec 31 in Los Angeles is 15:00 on Jan 1 in Auckland. With the official time server, a model said Jan 2.
2. I built an MCP server that answers time questions from data, not memory: conversions that flag DST gaps, holidays for 207 countries, business days, meeting slots.
3. Fully offline, milliseconds per call. Saudi weekend is Fri-Sat; Boxing Day's substitute counts; "EST" in July is noted as EDT.
4. Free, MIT: {{repo}}

## LinkedIn

Scheduling agents fail on the edges of the calendar: daylight-saving weeks, public holidays,
weekends that differ by country, deadlines in business days. I built World Time, an open-source MCP
server that answers these from the time zone database and holiday rules for 207 countries, offline
and in milliseconds, with a meeting finder that respects everyone's hours and holidays. {{repo}}

## awesome-mcp-servers entry (Other Tools and Integrations)

- [arhancanli/{{package}}]({{repo}}) 📇 🏠 🍎 🪟 🐧 - Offline time zones, DST-safe conversions (flags skipped and repeated times), public holidays for 207 countries and states, business-day math with each country's weekend, and meeting slots across zones.

## Directory blurbs

- Short: {{summary}}
- Long: {{description}}

## Cross-links

Footer: {{collection_size}} servers, each measured before release: {{collection_topic}}. Related: {{related}}.
