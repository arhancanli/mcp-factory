// The calls the golden tests replay and scripts/perf.mjs times. test/record.mjs runs them against
// the live RFC Editor and IANA and stores the responses (slimmed, compressed) in test/fixtures.
export const SCENARIOS = [
  { label: "rfc_info: RFC 2616, BCP 14, a draft name and a missing number", tool: "rfc_info", args: { ids: ["RFC 2616", "BCP 14", "draft-ietf-httpbis-semantics", "RFC 99999"] }, example: true },
  { label: "rfc_section: RFC 9110 section 12.5.1 with its errata", tool: "rfc_section", args: { rfc: "9110", section: "12.5.1" } },
  { label: "rfc_section: RFC 7231 section 6.5.4 (paginated, obsolete)", tool: "rfc_section", args: { rfc: "RFC 7231", section: "6.5.4" } },
  { label: "rfc_section: find a phrase in RFC 9110", tool: "rfc_section", args: { rfc: "9110", find: "must not generate" } },
  { label: "search_rfcs: http semantics", tool: "search_rfcs", args: { query: "http semantics" } },
  { label: "iana_lookup: HTTP status 418", tool: "iana_lookup", args: { registry: "http-status-codes", query: "418" } },
  { label: "iana_lookup: media type application/json", tool: "iana_lookup", args: { registry: "media-types", query: "application/json" } },
  { label: "iana_lookup: port 5432", tool: "iana_lookup", args: { registry: "port-numbers", query: "5432" } },
  { label: "rfc_section: a section that does not exist", tool: "rfc_section", args: { rfc: "9110", section: "99.9" }, expectError: true },
];

// RFCs whose index entries and errata the fixtures keep; plus HTTP-titled entries for search.
export const KEEP_RFCS = [2068, 2119, 2616, 7230, 7231, 7232, 7233, 7234, 7235, 8174, 9110, 9111, 9112];
