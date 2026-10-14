# World Time review, 14 October 2026

The selected comparison is now the broader `mcp-datetime` 0.2.0 at immutable
Git commit `7068460121e41918c3cfb0e3ce0dc785a6697ffd`. Its published interface
covers dated conversions, duration/calendar arithmetic and business days. Its
actual native list has 17 tools and 11,215 model-visible characters; World Time
has five and 2,924. This measures schema size. Agent accuracy and total tokens
remain unmeasured for this source and corpus.

| Reviewed candidate | Relevant coverage | Decision |
| --- | --- | --- |
| [Official reference time](https://pypi.org/project/mcp-server-time/2026.10.10/) | Current time and current-date HH:MM conversion | Retain as secondary reference; the older sole baseline was too narrow for the full calendar corpus |
| [Simple Timeserver](https://github.com/andybrandt/mcp-simple-timeserver/tree/9508ba5a70bd90c3250d3346f37bbb4391df093c) | Location/cultural calendars, NTP, holidays and business-day distance | Useful broader service, but no general dated-conversion/duration-add interface |
| [Business Day MCP](https://github.com/fbdo/business-day-mcp/tree/07cb4f64033388bbb0a6f9eacdfa5a4665be0704) | Subdivision holidays and business-day workflows | Strong specialized holiday challenger; lacks general timezone/calendar conversions |
| [Go time utilities](https://github.com/TheoBrigitte/mcp-time/tree/275571e41cb5da687c623df96023f292d18ca563) | Relative dates, formats, conversion and duration | Relevant date utility; no holiday/business-calendar interface in the review |
| [DateTime](https://github.com/matt0733/get-date-time/tree/7068460121e41918c3cfb0e3ce0dc785a6697ffd) | Dated conversion, calendar and business-day operations | Selected by broad relevant overlap; all 17 native tools remain enabled |

The last candidate has zero observed stars. Selection uses relevant executable
coverage, not popularity. Its source LICENSE is MIT despite GitHub's NOASSERTION
metadata. Its market-related functions are outside this CanliLabs corpus; no
finance/trading niche is added. The launch pins the source, Python and direct
dependencies, and uses the packaged pinned time-zone data.

Demand observations are dated in the [structured review](2026-10-14-world-time.json).
[PyPI Stats](https://pypistats.org/api/packages/mcp-server-time/recent) reported
589,169 reference-time package downloads in the recent month; these are download
events, not unique users. Simple Timeserver had 34 stars and 15 forks and 106
reported recent-month package downloads. No adoption for CanliLabs is inferred.

The fixed corpus now has 24 tasks, including ten independent questions requiring
multiple operations. Direct verification passed 24/24 through 37 real stdio calls.
The complex questions are also in `servers/world-time/bench/evaluation.xml`.
Calendar/zone answers were checked against independent Python date calculations,
[IANA](https://www.iana.org/time-zones), [GOV.UK bank holidays](https://www.gov.uk/bank-holidays),
[UK clock changes](https://www.gov.uk/when-do-the-clocks-change) and
[NSW daylight saving](https://www.nsw.gov.au/about-nsw/daylight-saving).

This review found a real defect: the pinned holiday library omitted Scotland's
15 June 2026 bank holiday, and UK city provinces did not select the correct
home-nation calendar. The reviewed government snapshot, geographic aliases and
regional meeting tests correct both paths. Weekly canaries compare every reviewed
UK division/year with the public government data. Runtime tools remain offline.

The shared benchmark launcher previously copied the complete parent environment
into peers. It now uses the SDK's system variables plus explicitly declared peer
values. A real subprocess test checks isolation. Performance now includes process
startup and MCP initialization, separately records first-request and repeat
samples, rejects failed repeats and closes peers on failures/deadlines. Older
reports are retained with their actual request-only timing scope.

Before release: run a paid paired agent comparison under the owner's API policy,
then qualify the final committed package/tree, obtain reviewed-main parity and
publish/prove the release. Direct answers and static tool size do not close those
gates or prove the strongest server globally.
