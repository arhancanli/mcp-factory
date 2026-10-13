# Decision and execution log

## 2026-10-13: goal launch and recovery

The owner requested work on CanliLabs, preservation of earlier goals, thousands
of the best MCP servers, and a complete laboratory for AI/model training, data,
ML, DL, RL, and wider learning methods. Registered an active session goal without
a token budget because none was requested.

Recovered `arhancanli/mcp-factory`, whose config explicitly names Canli Labs.
Read the original specification, scout, source, tests, and CI. Verified a clean
main checkout at e52f29f, fetched origin, and inspected open dependency PRs.
Created an isolated branch/worktree for implementation.

Preserved the original scout/build/gate/benchmark/ship process, independence and
installability, bounded tools/network/results, competitor measurement, directory
distribution, routing/composition, adoption, maintenance, owner identity and
owner-authored marketing. Preserved the scout's exclusion of finance/quant/trading.

Planning choice: a minimum of 2,000 distinct qualifying released servers makes
"thousands" measurable. This is an initial interpretation, not a reduced ceiling
or a current achievement. No wrapper multiplication is used to satisfy the count.

Found 21 local catalog entries and five servers without agent benchmark result
directories. Found a concrete shared HTTP Origin/Host protection gap. These are
recorded as unmet quality work, not assumed away.

The Firecrawl CLI is unavailable locally; current technical references were
checked using the available web tool and primary documentation. References and
the limits of the recovered evidence are recorded in SOURCES.md.

## 2026-10-13: executable laboratory and quality foundation

Implemented the locked Python package with real CPU ML/DL/RL training, held-out
evaluation, baselines, seed controls, checkpoints/reload checks, bounded inference,
content-addressed CSV manifests and split leakage checks. Added an append-only
trial/event ledger recording failed attempts, immutable configs, source/environment
hashes and artifact hashes. Added three metadata-only, read-only stdio MCP tools
and a pinned macOS CPU CI workflow. The general registered-data training path,
Linux CPU, accelerators, deep RL, foundation models, production delivery and full
curriculum remain separate work; no cluster or production corpus is claimed.

Validation: 14 lab tests pass; the actual trained ML record and dataset were read
over real stdio MCP without database changes; ten independent frozen task answers
were verified through fourteen MCP calls. Ran two nine-run validation cohorts
(three seeds per recipe), retained both receipts with their source hashes, and
recorded 19 total main-ledger attempts at the final cohort. The evaluation fixture
is a metadata replica of the final real runs, explicitly without model weights.
No paid agent/incumbent comparison was executed.

Fixed shared HTTP Host/Origin validation and loopback defaults; required explicit
trusted hosts for remote binding; protected body/connection limits and logs.
Upgraded SDK pins to 1.32.1 and regenerated all standalone shrinkwraps and vendored
kit/docs. This resolves the high-severity npm audit finding affecting SDK OAuth
clients, without claiming these stdio/server paths exposed that client flaw.
Factory checks increased from a passing 287 baseline to passing 290; root npm
audit now reports zero vulnerabilities. Upstream dependency PRs remain untouched.

Audited all 21 source/catalog entries twice. No exact npm version was found;
Registry failures were kept as unknowns rather than absence. Five servers lack
agent benchmarks. Twelve meet the simple historical accuracy/token calculation
in at least one saved result, which is less than the full shipping claim. Recorded
actual canary conclusions and separate missing/error states.

Triaged two remote canary failures. Recall Check's complete live canary passes
locally; the remote failure is retained as evidence. Express History.md no longer
contains release dates, so Release Notes correctly uses the registry's date rather
than the former heading date. Repaired its canary to assert the stable version and
deprecation statement, added a regression test for the registry-date fallback,
and preserved old recorded golden fixtures. All ten Release Notes offline tests
pass. A live retry encountered a transient tool timeout; improved error diagnosis
and cleanup before another bounded attempt.

## 2026-10-13: signed review and standalone validation

Owner-signed implementation commit d5f1ae2 (local signature status G) was pushed
and opened as draft PR #9. Validated its committed tree as 21 standalone
repositories: all 270 server tests passed and every packed npm tarball answered
initialize. The receipt records the exact commit. Laboratory CI on macOS 15 and
CodeQL passed. Release Notes' next bounded full live canary passed after the
date-assumption repair and improved diagnostic/cleanup handling.

Factory CI's only reported Node 24 failure was the existing author-email rule:
GitHub's temporary PR merge commit used a second account email belonging to Arhan
Canli. Verified that commit's author login is arhancanli, its author name matches
the owner, its GitHub signature verification is true, and its parents are the
recovered base and our signed implementation. Added that exact owner address to
the allowlist while retaining the owner-name, committer and credit checks. No
other author was approved. CI is being rerun after the correction.

Fixed the evaluation verifier's default receipt location so a fresh checkout can
execute the documented command without attempting to overwrite the committed
public receipt. A fresh timestamped private receipt passed all ten answers through
fourteen MCP calls. The original public receipt remains unchanged.

## 2026-10-13: matrix validation and SQL test timing

After the owner-address correction, all three factory CI gates passed on Node 20,
22 and 24. Laboratory CI and CodeQL also passed. The standalone job on the next
commit reported an intermittent SQL Check failure but discarded npm test stdout,
so its test diagnostics were unavailable. Added bounded stdout/stderr excerpts
to the runner for actionable failure evidence.

The runaway-query test had applied its special three-second limit to cold
WebAssembly startup and replacement initialization as well as the runaway query.
Separated those setup/recovery steps onto the normal production deadline and
added an assertion that initial warm-up really returned SELECT 1. The actual
runaway-query limit remains three seconds, with the elapsed limit, thread-exit
and SELECT 42 recovery assertions intact. All 11 SQL Check tests passed locally.
This is a test/diagnostic repair, with no change to production engine deadlines.
Fresh standalone CI is required before finalizing the review milestone.
