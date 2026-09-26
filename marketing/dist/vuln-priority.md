# Vuln Priority: launch kit

Numbers are filled from the server's measured files (`node scripts/launch-kit.mjs vuln-priority`).
Post only after the release is on npm.

## Positioning

- One line: tells agents which vulnerabilities to fix first, by evidence of exploitation rather
  than CVSS alone.
- Who it is for: developers and security engineers triaging scanner output with coding agents,
  platform teams working through a dependency backlog, anyone reading a Dependabot queue.
- Why now: scanners hand agents long CVE lists sorted by CVSS, and CVSS measures how bad an exploit
  would be, not whether anyone is exploiting it. CISA's KEV catalog, FIRST's EPSS and CISA's SSVC
  decisions answer that, but live in three places.
- Proof: one ranking from KEV, EPSS, CVSS and SSVC, a reason on every row, and for packages the one
  upgrade that fixes everything, checked against every advisory's ranges. Tool definitions of
  2,298 characters against 12,864 for mukul975/cve-mcp-server, the most-starred vulnerability server (28 tools).

## Show HN

**Title:** Show HN: Vuln Priority, an MCP server that ranks CVEs by real-world exploitation

**Text:**

Agents triaging vulnerabilities tend to sort by CVSS, which says how bad an exploit would be but not
whether one exists. I built an MCP server that ranks CVE ids, GitHub/PyPI/Go/RustSec advisories, or
package versions from a lockfile by the evidence that predicts harm: is it in CISA's Known Exploited
Vulnerabilities catalog (and used by ransomware), what is its EPSS probability of exploitation in
the next 30 days, and what did CISA's SSVC assessment say about exploitation and automation.

Each result gets a tier (act_now, high, medium, low) and a one-line reason. For packages it also
gives the smallest upgrade that fixes every known advisory, checked against each advisory's affected
ranges, because a later branch can be affected again. Duplicate advisories for the same CVE are
merged. First calls took 0.6 to 2.9 s in my measurements, repeats 3 ms or less.

No key, MIT: https://github.com/arhancanli/vuln-priority-mcp. `npx -y vuln-priority-mcp`

## Reddit: r/netsec, r/devsecops, r/cybersecurity (check each subreddit's rules first)

**Title:** Free tool that ranks CVEs by KEV, EPSS and CISA's SSVC instead of CVSS alone, for AI agents

**Text:** Give it CVE ids or package versions; it returns act_now / high / medium / low with the reason
(KEV date and ransomware use, EPSS, SSVC, CVSS) and the upgrade that fixes each package. Works in
Claude Code, Cursor and other MCP clients. https://github.com/arhancanli/vuln-priority-mcp

## Reddit: r/mcp

**Title:** Vuln Priority: KEV + EPSS + SSVC triage in 4 tools

**Text:** `package_vulns`, `prioritize_vulns`, `recent_exploited`, `vuln_details`. Tool definitions 2,298 characters. `claude mcp add vuln-priority -- npx -y vuln-priority-mcp`. https://github.com/arhancanli/vuln-priority-mcp

## X / Bluesky thread

1. Your scanner sorts vulnerabilities by CVSS. CVSS says how bad an exploit would be, not whether anyone has one.
2. I built an MCP server that ranks them by exploitation evidence: CISA KEV, FIRST EPSS and CISA's SSVC decisions.
3. Every row says why. For packages it gives the one upgrade that fixes them all, checked against every advisory's ranges.
4. Free, MIT: https://github.com/arhancanli/vuln-priority-mcp

## LinkedIn

Most published vulnerabilities are never exploited, and a CVSS score alone does not say which ones
will be. I built Vuln Priority, an open-source MCP server that ranks vulnerabilities for AI agents
by CISA's and FIRST's own signals: known exploitation first (the KEV catalog), then the probability
of exploitation (EPSS) and CISA's SSVC decisions, with a reason on every row and the upgrade that
fixes each package. https://github.com/arhancanli/vuln-priority-mcp

## awesome-mcp-servers entry (Security)

- [arhancanli/vuln-priority-mcp](https://github.com/arhancanli/vuln-priority-mcp) 📇 ☁️ 🍎 🪟 🐧 - Ranks CVEs, advisories and package versions by exploitation evidence: CISA KEV (with ransomware use), FIRST EPSS, CISA SSVC and CVSS, with a reason per row and the upgrade that fixes each package.

## Directory blurbs

- Short: Which vulnerabilities to fix first: CISA KEV, EPSS, CVSS and CISA's SSVC decisions in one ranking.
- Long: Ranks CVEs and package vulnerabilities by real-world risk: CISA's Known Exploited Vulnerabilities catalog, FIRST EPSS exploit probability, CVSS, and CISA's SSVC decisions from the CVE record, with the fixed version for each package. No key.

## Cross-links

Footer: 8 servers, each measured before release: https://github.com/topics/arhancanli-mcp. Related: Citation Check (https://github.com/arhancanli/citation-check-mcp), Drug Label (https://github.com/arhancanli/drug-label-mcp), End of Life (https://github.com/arhancanli/end-of-life-mcp).
