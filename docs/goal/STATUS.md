# Current status

Updated: 2026-10-14 (Asia/Dubai). Overall goal: active; incomplete.

Repository: `arhancanli/mcp-factory`. Actual `origin/main`: `e52f29f`.
Active worktree: `/Users/arhancanli/canlilabs-linux-20261014`.
Branch: `codex/canlilabs-linux-cpu-20261014`, based on validated capacity head
`6d6a655`. The original checkout remains clean on main. Foundation
[PR #9](https://github.com/arhancanli/mcp-factory/pull/9) is open, ready for review
and unmerged; all seven checks passed on its final head. The data/lifecycle slice
is owner-signed at `9bda49c` and open as stacked
[PR #10](https://github.com/arhancanli/mcp-factory/pull/10), ready for review.
All seven checks passed on `4dc15f9` and portable-fixture head `cecee19`.
GitHub verifies the owner signature.
It depends on PR #9 and is not merged or published. Exact check URLs and the tested
source are in [data-ci-validation.json](evidence/2026-10-14-data-ci-validation.json).
The later [portable-fixture CI receipt](evidence/2026-10-14-portable-fixture-ci-validation.json)
also records the successful ten-task step and frozen hashes.
The final data review passed all seven checks at `77b292d`; its
[reviewed CI receipt](evidence/2026-10-14-reviewed-data-ci-validation.json) binds
42 lab tests and twelve public runs to the current package fingerprint.
Fresh inspection confirms both reviews are still open and unmerged. The previous
turn is progress. The next independent slice enforces exact-source release evidence,
adds reproducible benchmark/performance provenance, distinguishes registry failures
from absence and keeps standalone repository updates under owner review.
The release implementation is open as [PR #11](https://github.com/arhancanli/mcp-factory/pull/11),
ready for review after all seven checks passed on a8e45da. Its first real
qualifier found an incorrect canary path after three technical stations passed;
the attempt is retained. CodeQL identified a stat/read race and file-derived HTTP
metadata query. Both are repaired without dismissing findings; the review has zero
open CodeQL alerts. Readiness reports 0/21 qualified releases, not 21 failed servers.
The current [readiness report](evidence/2026-10-14-release-readiness.json) retains
the five missing agent-result directories and zero current performance snapshots.
The real World Time qualifier subsequently passed 296 factory tests, 12 independent
server tests, real packed initialize/tools-list requests, audit and the live clock
canary. Its raw logs and receipt are in docs/quality/world-time/381065b6.../.
This proves technical checks, not scout/agent/performance qualification or release.
[Release CI evidence](evidence/2026-10-14-release-ci-validation.json) records exact
head and check URLs. The remaining 21 independent packages also pass CI. All wider
laboratory objectives stay active; this phase changed no training algorithms.

All seven checks also passed on PR #11's documentation/evidence head `3ef6eca`.
The preceding turn is progress. The next independent capacity slice selects
packed-install checks from complete Git diffs, widens shared/unknown changes,
keeps main/weekly/manual full checks, and bounds standalone work to sixteen
shards with four concurrent workers. Full Node factory gates remain unchanged.
No scheduling simulation counts as an implemented or maintained server. Current
implementation passes 302 local factory checks and 34 standalone checks over
three actually packed packages, plus actionlint workflow validation. The
[local capacity receipt](evidence/2026-10-14-ci-capacity-local.json) binds source
hashes, real package trees/integrities/timings and fifteen synthetic scheduling
scenarios. The 2,000-name full scenario creates sixteen 125-name shards; it proves
no releases or end-to-end fleet capacity. Fresh remote CI and signed review follow.

The capacity implementation is owner-signed at `03dd00e` and open as
[PR #12](https://github.com/arhancanli/mcp-factory/pull/12), ready for review,
stacked on #11. All eight checks passed: Node 20/22/24, planner, standalone shard,
stable aggregate and both CodeQL checks. Downloaded CI logs confirm 302 factory
checks and 270 server checks over all 21 exact committed standalone trees, with
real packed MCP initialization/tool-list calls. The serial package workload was
101,481 ms for this cohort. This is not measured fleet capacity for thousands.
[Capacity CI evidence](evidence/2026-10-14-ci-capacity-validation.json) retains
exact check URLs, every tree/integrity/timing and log hashes. This follow-up is
documentation only. Verify actual PR/head/check state on continuation.

Fresh inspection confirms PR #12 is open, ready and unmerged at `6d6a655`, with
all eight checks passing again. The previous turn is progress. This independent
laboratory slice selects the official Linux CPU Torch index, keeps all existing
version pins, and adds Linux alongside macOS to the behavioral/MCP/frozen-task
checks. Actual Linux execution, dependency inspection and CPU training receipts
are required before calling this platform validated. GPU/distributed compute,
new learning methods and all MCP release/adoption requirements remain separate.

Local profile implementation now passes 47 behavioral tests, lint/format and
302 factory checks. Two real stdio integrations and ten frozen answers through
fourteen calls also pass. The reviewed source fingerprint is
`ac0a7bf6fefb9b56a023ad3982f7d1b79658695d4f9e1273dc0e40cfe85f7de5`.
The [local validation receipt](evidence/2026-10-14-linux-cpu-local-validation.json)
binds 21 reviewed actual training trials (nine ML/DL/RL plus twelve UCI) and keeps
the initial nine-run source separate. All reloads pass, with fixed parameters.
The new CI matrix requires both cohorts and all checks on each platform. Linux
proof remains pending until those jobs finish; every larger requirement stays active.

The implementation is signed at `75dd090` and open as stacked
[PR #13](https://github.com/arhancanli/mcp-factory/pull/13). Its first Ubuntu job
passed 47 tests, both real integrations, all 21 actual trials and the ten frozen
task answers. Downloaded receipts verify Linux x86_64, Torch 2.14.1+cpu and no
GPU packages. macOS failed at interpreter setup before application execution;
the [failed bootstrap receipt](evidence/2026-10-14-cpu-bootstrap-ci-attempt.json)
retains that result. CI now installs the same exact managed interpreter used
locally. Versions, recipes and acceptance gates are unchanged; fresh CI follows.

## Current executable laboratory

- Locked Python 3.12 CPU environment; real ML, PyTorch MLP and tabular RL recipes.
  Registered tables now support binary/multiclass classification and regression,
  explicit feature order, original-label inference and checkpoint reload checks.
- Atomic, content-addressed CSV registration with declared source/licence,
  attribution and optional lineage. Public ingestion records original archive,
  member and converted hashes plus transformations. Dataset metadata stays bounded.
- Explicit random/group/time split evidence with every row accounted for, numeric
  feature duplicates held together, transitive subject links, strict chronology and
  timestamp ties. Exact target copies and non-finite inputs are rejected.
  Profiles use training rows for feature statistics. Semantic/approximate leakage
  and task-specific time windows remain separate qualification work.
- Append-only trial ledger, configs/seeds/source/environment/data/split/artifact
  hashes and failed attempts. Workers hold a POSIX lease before a run becomes
  visible. Recovery refuses live, missing, replaced or unverifiable legacy leases.
  Interrupted workers can be recorded as failed without replacing final states.
- SQLite is authoritative; complete derived JSON receipts are published atomically.
  Receipt I/O errors cannot turn committed successes into failures. Missing copies
  can be rebuilt; altered copies are reported. Hash-verified model cards and
  comparisons on identical held-out protocols retain failure/trial counts and
  perform no automatic test-based promotion.
- Three read-only MCP tools remain within the compact tool-list budget. Dataset
  inspection can verify a run's split, training profile and source/licence hashes,
  with no raw rows, split positions or weights returned. Real stdio tests confirm
  the database is unchanged and tampered split/rights metadata is rejected.

Local checks: 42 behavioral lab tests, two real stdio integrations, lint/format,
290 factory checks and ten frozen task answers through fourteen MCP calls.
Lab lint/format, behavioral tests and integrations passed in macOS CI, with Node
20/22/24 gates, all 21 standalone packages and JavaScript/Python CodeQL. The ten
frozen task answers also passed locally and are now added as a required lab CI step.
Its first run caught a regenerated-fixture hash difference across hosts after all
behavioral/integration tests passed. The helper now uses the exact public CC0
synthetic fixture and splits from the recorded cohort, checking all hashes.
The portable step then passed on `cecee19`: CI logs verify all ten answers through
fourteen MCP calls. The earlier failure is retained. All seven checks passed again.
These task answers are not an agent/incumbent benchmark. A final data review added
three edge-case tests and corrections for numeric target aliases and large time
ties. All 42 tests, integrations and frozen tasks pass in CI at `77b292d`.
The final receipt commit changes documentation only; recheck current PR state on resume.

Three separate twelve-run public cohorts are retained. The reviewed cohort in
[registered-data-reviewed-runs.json](evidence/2026-10-14-registered-data-reviewed-runs.json) uses
fixed seeds 7/19/43, split seed 2718, default ML parameters and 30 DL epochs.
Both recipes achieved 30/30 Iris test predictions per seed against a 1/3 majority
baseline. On 967 held-out Wine Quality examples, ridge RMSE was 0.719 and MLP RMSE
0.666-0.677, against 0.859 for the training-mean baseline. All checkpoints reloaded.
These are two small public tasks on fixed splits, not population uncertainty,
strongest-model evidence or production qualification. Both source pages declare
CC BY 4.0; receipts retain creator attribution and conversion lineage. UCI data and
weights stay local; the committed frozen fixture is public CC0 synthetic data.
The two earlier cohorts retain their source hashes; the newest receipt matches
the reviewed package and keeps all twelve new trials. Parameters were unchanged.
Its exact package fingerprint is
`17633f3a0172315349a6a595f5c811a514645ebe2d4bc0d331ddb5e39130d24e`.
Iris has one duplicate feature row;
Wine Quality has 937. All rows are retained in disjoint components. Wine split
counts are 2,959 training, 972 validation and 967 test examples.

The foundation's nine final synthetic/RL runs and 19 main-workspace attempts at
recording remain in their dated receipt. Original smoke results and earlier failed
canary evidence are retained; newer work does not overwrite historical records.

## Verified factory foundation and remaining release gaps

The foundation upgraded SDK 1.30.1 to 1.32.1 across the kit/template/21 packages,
regenerated locks/vendor copies/docs and passed npm audit with zero vulnerabilities.
It added loopback defaults, exact Host/Origin validation, declared remote hosts,
bounded HTTP bodies/connections and safe unexpected-error logs. Factory checks:
290/290. Standalone validation: 21 packages, 270 server tests and every packed
initialize. Node 20/22/24, macOS lab and both CodeQL checks passed on PR #9.
Its SQL timing repair preserves the exact runaway-query deadline and recovery
assertions. The owner identity/signing/credit gates remain enforced.

The [second release audit](evidence/2026-10-13-factory-audit-second.json) contains
21 source/catalog entries, 21 saved performance files and 16 agent benchmark
directories. Config Check, Dockerfile Check, Kube Check, Regex Check and SQL Check
lack agent comparisons. Twelve servers meet a simple historical accuracy/token
calculation in at least one saved result; this is less than current best-in-niche
qualification. All 21 declared exact npm versions returned missing. Matching
Registry versions were not verified; timed-out queries remain unknown. Repository
parity, public release assets/provenance and maintained release counts remain
unverified. The laboratory pilot is not counted as a standalone release.

The audit recorded 18 successful latest canaries, Recall Check and Release Notes
failures, and SQL Check unknown. Both failing canaries passed later local triage.
Release Notes' stable assertion and undated-history fallback were repaired;
remote deployment and subsequent health remain separate work. Dependency PRs
#3-#8 were open at recovery and were not merged. Existing initial npm publishing
uses owner browser confirmation/Trusted Publisher after qualification.

## Next unmet gates

Integrate the reviewed foundation and data slice under the existing owner review
policy. Independently advance release-readiness evidence and missing MCP comparisons,
remote canary rollout, Linux CPU validation, promotion/rollback and checkpoint
resume, accelerator/deep-RL/foundation-model recipes, and practical education.
[BACKLOG.md](BACKLOG.md), [REQUIREMENTS.md](REQUIREMENTS.md) and
[COVERAGE.md](COVERAGE.md) preserve every original and expanded objective.
Scale through 100, 500 and at least 2,000 distinct maintained qualifying releases;
publication, demand, current competitor evidence, discovery and adoption still
require proof. No broad objective is closed by this local milestone.
