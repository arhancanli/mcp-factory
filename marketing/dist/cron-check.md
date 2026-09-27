# Cron Check: launch kit

Numbers are filled from the server's measured files (`node scripts/launch-kit.mjs cron-check`).
Post only after the release is on npm.

## Positioning

- One line: explains cron expressions, lists their next runs in any time zone, and converts them
  between schedulers, with the rules of each.
- Who it is for: developers and DevOps engineers whose agents write CI schedules, CronJobs, AWS
  EventBridge rules, Spring and Quartz jobs.
- Why now: cron is short enough that agents write it from memory and subtle enough to be wrong:
  the day-of-month OR day-of-week rule, uneven steps, Sunday as 0 or 1, GitHub's 5-minute floor,
  daylight-saving gaps.
- Proof: six dialects, L/W/#, never-firing schedules caught, DST-aware next runs, conversions that
  refuse what a target cannot express. Offline. Tool definitions of 1,872 characters.

## Show HN

**Title:** Show HN: Cron Check, an MCP server that explains, schedules and converts cron expressions

**Text:**

Cron expressions are short, so agents write them from memory, and cron is full of traps: 0 0 13 * 5
runs every Friday and every 13th (not only Friday the 13th), */7 leaves a 4-minute gap at the top of
the hour, Quartz and AWS count Sunday as 1, GitHub Actions never runs more often than every 5
minutes, and 02:30 does not exist on the night clocks go forward.

I built an MCP server that knows the rules of six schedulers (Unix cron, GitHub Actions,
Kubernetes, AWS EventBridge, Quartz, Spring): it explains expressions in plain English and flags the
traps, lists the next runs in any time zone with daylight-saving effects marked, and converts
between dialects, refusing with a fix when the target cannot express the schedule. It runs offline.

MIT: https://github.com/arhancanli/cron-check-mcp. `npx -y cron-check-mcp`

## Reddit: r/devops, r/sysadmin (check each subreddit's rules first)

**Title:** Free tool so AI agents stop getting cron wrong: explain, next runs by time zone, convert to AWS/Quartz

**Text:** Six dialects, the OR rule, uneven steps, never-firing dates, DST gaps, GitHub's 5-minute
floor. Works in Claude Code, Cursor and other MCP clients. https://github.com/arhancanli/cron-check-mcp

## Reddit: r/mcp

**Title:** Cron Check: explain, schedule and convert cron in 3 tools

**Text:** `convert_cron`, `explain_cron`, `next_runs`. Tool definitions 1,872 characters. `claude mcp add cron-check -- npx -y cron-check-mcp`. https://github.com/arhancanli/cron-check-mcp

## X / Bluesky thread

1. 0 0 13 * 5 runs every Friday AND every 13th. Most people (and models) think it means Friday the 13th.
2. I built an MCP server that knows cron's rules across Unix, GitHub Actions, Kubernetes, AWS, Quartz and Spring.
3. Plain-English explanations, next runs in your time zone with DST gaps flagged, and conversions that refuse what the target can't express.
4. Free, MIT, offline: https://github.com/arhancanli/cron-check-mcp

## LinkedIn

A wrong cron expression fails quietly: the job runs twice as often, on the wrong day, or never.
I built Cron Check, an open-source MCP server that explains cron expressions, lists their next
runs in any time zone and converts them between schedulers, following each scheduler's own rules.
https://github.com/arhancanli/cron-check-mcp

## awesome-mcp-servers entry (Developer Tools)

- [arhancanli/cron-check-mcp](https://github.com/arhancanli/cron-check-mcp) 📇 🏠 🍎 🪟 🐧 - Explains cron expressions and flags their traps (day OR weekday, uneven steps, never-firing dates), lists next runs in any time zone with DST gaps, converts between Unix, GitHub Actions, Kubernetes, AWS EventBridge, Quartz and Spring. Offline.

## Directory blurbs

- Short: Explains cron expressions, lists next run times in any time zone, converts between cron dialects.
- Long: Cron expressions checked instead of guessed: a plain-English explanation, validation with the gotchas that bite (day-of-month OR day-of-week, steps that do not divide evenly, dates that never come), the next run times in any time zone with daylight-saving effects noted, and conversion between Unix cron, GitHub Actions, Kubernetes, AWS EventBridge, Quartz and Spring. Offline, no key.

## Cross-links

Footer: 21 servers, each measured before release: https://github.com/topics/arhancanli-mcp. Related: Actions Check (https://github.com/arhancanli/actions-check-mcp), Citation Check (https://github.com/arhancanli/citation-check-mcp), Config Check (https://github.com/arhancanli/config-check-mcp).
