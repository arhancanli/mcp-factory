// The calls the golden tests replay and scripts/perf.mjs times. test/record.mjs runs them against
// the live resolvers, IANA, the Public Suffix List and RDAP servers, and stores the responses,
// compressed, in test/fixtures.
export const NOW = Date.parse("2026-09-26T12:00:00Z");

export const LOOKUPS = ["google.com", "mail.google.com", "bbc.co.uk", "thisdomainsurelydoesnotexist-xyz123.com", "example.io"];

export const SCENARIOS = [
  { label: "domain_report: google.com", tool: "domain_report", args: { domain: "google.com" }, example: true },
  { label: "domain_report: intel.com (DMARC p=none)", tool: "domain_report", args: { domain: "intel.com" } },
  { label: "check_spf: gmail.com for one of Google's sending IPs", tool: "check_spf", args: { domain: "gmail.com", ip: "209.85.220.41" } },
  { label: "check_spf: gmail.com for an outside IP", tool: "check_spf", args: { domain: "gmail.com", ip: "1.2.3.4" } },
  { label: "check_spf: oracle.com, at the 10-lookup limit", tool: "check_spf", args: { domain: "oracle.com" } },
  { label: "check_dkim: github.com, named selectors", tool: "check_dkim", args: { domain: "github.com", selectors: ["google", "selector1", "nope"] } },
  { label: "check_dkim: stripe.com, 30 common selectors", tool: "check_dkim", args: { domain: "stripe.com" } },
  { label: "dns_lookup: github.com from two resolvers", tool: "dns_lookup", args: { name: "github.com", compare: true } },
  { label: "domain_lookup: 5 names (subdomain, co.uk, unregistered, no RDAP)", tool: "domain_lookup", args: { domains: LOOKUPS } },
  { label: "domain_report: a name that does not exist", tool: "domain_report", args: { domain: "doesnotexist-abc123xyz.com" }, expectError: true },
];
