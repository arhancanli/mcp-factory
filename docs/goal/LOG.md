# Decision and execution log

## 2026-10-14: native SQL failure contained during benchmark review

The first remote Node 24 gate at 4d91877 passes 316/317, then SQL Check's existing
runaway-query cancellation aborts its process in V8 ThreadIsolation/Wasm allocation
cleanup (SIGTRAP), on actual Node 24.21.0. Node 20, all independent packages and
CodeQL pass; matrix fail-fast cancels Node 22. Retained the exact failed job,
fatal check and log hash. No benchmark-budget test or paid API call failed.

Replace the SQL engine thread with a supervised child process. The supervisor
executes no WebAssembly, enforces deadlines and kills/reaps the busy engine on
parent disconnect. Preserve the three-second runaway/exit/replacement assertions
and ten-second production default; bound configured deadlines at 120 seconds.
Keep dialect queues separate from disposable engines so a queued call uses a
live replacement. Restrict child environment to system/locale essentials, retain
the 512 MiB JavaScript heap limit and describe its actual scope (not total RSS).

All fourteen local SQL checks now pass, including actual native-signal containment,
queued timeout recovery and a killed MCP parent with a running infinite query.
A misplaced cleanup edit was caught and corrected before validation. Real stdio
also initializes, lists and executes SELECT 42. Performance remeasurement exposed
the old unpinned SQLite reference failing on current Python/MCP APIs. Primary
PyPI identifies the archived 2025.4.25 release; pin it and the compatible existing
Python/MCP versions, label it as historical and keep current strongest SQL
comparison explicitly pending. No weak reference substitutes for that requirement.
Fresh measured performance, packed validation and full CI are still required.

## 2026-10-14: bounded runner and concrete free preparation validated

Implemented integer-USD request reservations covering the published full-context
ceiling, highest cache-write rate, bounded output and 20% margin. Verified usage
refunds unused exposure; unknown or unpriced responses retain the reservation and
stop. Budget mode pins the first-party endpoint/standard-only/global parameters,
uses the existing SDK with no automatic retries and a request timeout, and rejects
environment header overrides. Both provider paths/defaults remain; unpriced legacy
execution requires an explicit unbudgeted invocation. No provider was migrated.

An exclusive flushed journal persists reservations before API calls, settlements
and completed rows, survives a killed process and refuses resetting an existing
attempt. A test exposed source invalidation when the journal was inside source;
the runner now rejects that location before any paid call. Partial API/budget
attempts produce no new complete benchmark/README and always close the peer.
Anthropic rows now retain actual tool choices and explicit argument truncation.
All 13 benchmark tests and 317 full factory checks pass. SDK responses in tests
are synthetic fetch fixtures in temporary Git repos, not paid or niche results.

The real free World Time plan initializes/lists five/2,924 native tool/schema
characters and the pinned incumbent's 17/11,215. It records all 24 task IDs,
source 39323473..., every helper hash and the proposed fixed journal. No model
client/request or journal was created. Current credentials were inspected only
as availability booleans; no value was printed or stored. Prepared one USD 50
attempt at the existing Opus 4.8 default, with approval still pending under SPEC.
All 25 objectives and the release floor remain active; qualification count stays
zero. Remote CI and a signed review are required before the approval request.

## 2026-10-14: bounded paid benchmark preparation

Re-read continuity and inspected actual Git/PR state. PR #15's final signed
head fcbecc7 is open, ready, unmerged and passes all ten checks. Main remains
e52f29f; the previous goal turn made real progress. Created an isolated worktree
on that verified head. All 25 requirements and the maintained release floor remain.

The current paired-agent loop has eight turns/4,000 output tokens per request,
but no spend cap and saves only after the full run. Add conservative per-request
reservations, validated usage/refunds, no automatic request retries and durable
incremental task evidence. Preserve both existing provider paths and the default
model; this is no provider migration. Use current primary pricing/API docs and
offline tests before requesting the original owner-only paid API approval.

## 2026-10-14: deep RL learned and validated on both CPU platforms

Committed fixed DQN hyperparameters and functional learning criteria in signed
8347d7c before the first full held-out cohort. All 54 behavioral checks, three
actual stdio integrations and ten unchanged frozen answers over fourteen calls
pass locally. The full factory gate passes 307. Local seeds 7/19/43 achieve mean
returns 178.94/500/242.12, versus random 22.30/21.50/21.28. All three successful
trials, raw episode returns, validation/training curves and artifact hashes are
retained. No final-test outcome changed the hyperparameters or criteria.

All ten PR #15 checks pass at the same signed source. Downloaded both actual CPU
artifacts and raw logs. macOS arm64 and Linux x86_64 each pass 54 tests, three
real MCP integrations, ten frozen answers and 24 successful training trials:
nine original ML/DL/RL, twelve UCI and three DQN. All 48 CI runs/reloads match
source 046f3b49... and the pinned interpreter/CPU dependencies. The six DQN
CI policies pass all fixed criteria; mean returns are 178.06/500/252.02 on
macOS and 193.18/500/221.90 on Linux. Small host differences and different
validation-selected checkpoints remain visible. Retained nine explicit DQN
trials across local and CI, plus all 48 current-source CI trials; test fixtures
are separate. No bitwise, solved-task, strongest-algorithm or production claim.

Verified 307 factory checks and 272 independent tests over all 21 exact packed
trees. Marked #15 ready for review, stacked on #14 through #9. PR #14's final
evidence head 694161f also passes all eight checks. No owner merge, paid API,
publication or launch occurred. All 25 objectives and the 2,000 maintained-release
floor remain active. Next work includes current paid agent qualification with
an approved bounded budget, other useful MCP cohorts/discovery, lifecycle resume/
promotion/rollback, wider data/modalities/foundation models/PPO and education.

Fresh committed-tree readiness remains 0/21 certificates, with World Time's
performance now current. Consolidated STATUS into the actual current workspace,
review table, scientific/factory evidence and next unmet work. Preserved its prior
narrative in dated evidence, and all original objectives in requirements/coverage.

## 2026-10-14: independent deep reinforcement learning slice

Re-read the five continuity records and inspected actual Git/main/PR state.
The previous goal turn made authoritative progress; PR #14 implementation has
all eight checks passing, and final documentation head 694161f is under CI.
Created an isolated worktree on that exact committed evidence head. No merges
or paid APIs were used. Extend the real tabular RL path with CartPole-v1 DQN,
bounded CPU training, seeded replay, target network and validation selection.
Independent final evaluation and random policy use matching held-out resets.
Retain all seeds, failures and raw episode returns; verify checkpoint reload.
All original MCP and broader lab/coverage requirements stay active.

## 2026-10-14: current MCP technical evidence and review complete

Re-read continuity and freshly checked PR #14 at signed head 361cdb5. All eight
checks pass. Downloaded actual Node 24 and independent package logs: 307 factory
checks, 272 server tests, all 21 exact trees, packed initialization and tool lists.
The World Time technical qualifier completes factory/standalone/audit/canary
stations. Verified every raw log hash and matching direct/performance/source
fingerprints 39323473..., full tree 2c7b0e7..., and identical local/CI tarball
integrity. Retained the qualifier and dated CI receipt, marked PR #14 ready.

No paid agent API call, release, owner merge or launch occurred. Direct fixed
answers and measured schema sizes cannot close the paired-agent station. All 25
requirements and the minimum 2,000 distinct maintained-release objective remain
active. This final evidence update changes no laboratory or server runtime.

## 2026-10-14: current MCP cohort qualification

Re-read continuity and checked actual Git/PR/main state. PR #13's final head
0dbf8b7 is clean, ready, open and passes all ten checks. Main remains e52f29f.
The previous turn made real progress: two-platform CPU training, protocol/task
execution and source-matched receipts. Created an isolated worktree/branch on
that validated head. The next MCP slice refreshes strongest relevant incumbents,
fixed independent task evidence and current performance before any release claim.
Found that the historical reference-time baseline is unpinned and broader
date/calendar alternatives now exist. Also found that perf.mjs starts timing
after MCP initialization while describing startup as included. Fix this actual
measurement gap and preserve older reports. No paid agent call or release is
authorized by a passing direct-tool check. Every owner requirement stays active.

## 2026-10-14: independent Linux CPU laboratory slice

Re-read the five continuity records and checked the actual clean capacity branch
and open ready PR #12. All eight checks also pass on final evidence head 6d6a655;
the prior turn is progress. Created an isolated branch/worktree on that head.
The existing Linux PyPI Torch lock includes CUDA dependencies although recipes
use CPU. The next implementation selects the official CPU index with a Linux
marker, retains all version pins and adds actual Linux behavioral/MCP/task and
training validation. This local machine is macOS and its container daemon is off;
Linux proof will come from the new CI job, not a cross-platform lock inspection.
All 25 requirements and the distinct maintained release floor remain intact.

## 2026-10-14: independent factory capacity slice

Re-read all five continuity files and checked actual branches and PR states.
PR #11's final evidence head 3ef6eca passes all seven checks; #9, #10 and #11
remain ready, open and unmerged. The previous turn made measurable progress,
not overall completion. Created a separate signed-review branch/worktree on
the validated release head. All 25 requirements and the 2,000-release floor stay
active. The next bounded implementation selects and shards independent package
checks without reducing their installation, protocol or golden-test station.
Full root Node gates continue; their own future sharding and real cohort
throughput/maintenance evidence remain part of M11.

## 2026-10-14: MCP release qualification slice

Re-read the five continuity records and original specification, fetched origin
and verified open PRs #9/#10 and unchanged main. The prior turn made authoritative
progress: the laboratory/data implementation, source-matched cohorts and all CI
checks passed. Created a separate worktree on the validated data head and updated
the home pointer. The current slice closes publication bypasses with source-bound
quality/scout/benchmark/performance evidence, explicit unknown registry states and
reviewable standalone repository updates. No paid agent run, merge or publication
is implied. All 25 requirements and the 2,000 distinct-release floor remain active.

## 2026-10-14: executable source and publication gates

Implemented a portable verifier binding executable/configuration/task hashes and
the complete final package tree. Benchmarks now record full graded answers, usage,
resolved model, source/task/incumbent/runner provenance; performance records bind
the same source. Historical results are unchanged and cannot be retrofitted into
current qualification. Added 10-100 paired-task and 90% absolute accuracy criteria,
while retaining incumbent accuracy/token/additional-coverage requirements. The
absolute floor rejects meaningless zero-answer token wins; it does not narrow
the niche or server-count objective.

Added committed scout/quality/benchmark/performance certificates with freshness,
raw-log/hash checks and exact packed integrity. Local and standalone tag publishing
both require qualification, distinguish unknown npm state from 404 absence, reject
existing versions with different bytes and confirm successful publication before
later stages. Mirroring now prepares signed draft PRs; only empty repos receive a
nonfunctional signed base. Owner source changes/review branches are not overwritten.
Collection topics and branding are retained. No publish, merge or launch was run.

The technical qualifier runs actual factory tests, standalone package tests,
real SDK initialize/tools-list calls, npm audit and the live canary. It produces
execution logs outside the package and cannot infer agent/scout success. Initial
factory validation passed 295 checks; the new identity canonicalization adds one
further case. Laboratory 42 tests and two integrations still pass. Readiness and
standalone execution evidence are required before completing this review slice.

## 2026-10-14: real qualifier and static-analysis findings

Opened signed implementation f4dac7a as draft PR #11, stacked on #10. The committed
readiness scan reports 0/21 qualifying releases, the same five missing agent
directories and no current performance provenance. Ran the real World Time
technical qualifier: factory tests, the independent packed install/SDK calls and
audit succeeded. It then stopped on an incorrect canary entrypoint chosen here.
Retained the failed attempt and logs. Corrected it to the existing scheduled
workflow's node --test test/live.canary.mjs invocation.

CodeQL analyzed successfully but its security gate found two repeated issues in
the new shared helper: path stat/read could race, and public-registry HTTP requests
depended on file fields. Reworked snapshot reads to one no-follow descriptor with
fstat/read/close, and exact npm metadata retrieval to the official CLI with bounded
public name/version inputs, fixed public registry, timeout and structured E404
handling. All other lookup failures remain unknown. No alert is suppressed or
dismissed. Focused release/benchmark checks pass; fresh CI/qualification are needed.

## 2026-10-14: release controls validated

All seven checks passed on a8e45da: Node 20/22/24, all 21 standalone packages,
laboratory and both CodeQL checks. Queried the review's code-scanning state:
zero open findings; none was dismissed. Saved CI links and the committed 0/21
readiness report. Both missing and legacy evidence remain deficits, not successes.
The corrected World Time qualifier completed all four real technical stations:
296 factory tests, 12 standalone tests with packed SDK initialization/tools-list,
audit and the live clock/time-zone canary. Saved raw logs and its source/tree/
tarball receipt while retaining the failed first attempt. No benchmark/scout
certificate was fabricated, and no publish, merge or launch was performed.
Marked PR #11 ready for review. It remains stacked on open #10 and #9. The next
work is current scout/task/performance/agent evidence on fixed incumbent versions,
plus the preserved Linux/accelerator/model-lifecycle and research coverage tracks.

## 2026-10-14: independent data and lifecycle slice

Re-read all continuity records and verified actual Git/PR state. Foundation PR #9
is open and unmerged at cd1dabf; its final checks passed. The prior turn is progress,
not completion of the overall goal. Created a separate worktree/branch based on
that reviewed foundation, preserving its complete requirements. Updated the home
continuity pointer. The next bounded slice makes registered numeric datasets
trainable with multiclass/regression recipes, explicit random/group/time splits,
normalized feature-duplicate checks and recoverable append-only trial records.

## 2026-10-14: registered data and recoverable scientific records

Implemented explicit numeric table selection, content/metadata hash checks,
multiclass logistic regression, ridge regression and variable-shape PyTorch MLP
classification/regression. Training alone fits feature/target scaling; validation
loss selects the neural checkpoint. Artifacts reload before success; inference
uses recorded feature order/count and returns original classification labels.

Implemented immutable profile/split evidence with source/licence hashes, every row
accounted for, normalized numeric duplicates including conflicting targets, subject
components including transitive duplicate links, and strict time/tie handling.
Exact numeric target copies, unknown evaluation classes and non-finite data fail
explicitly. Added atomic exclusive publication for CSV/JSON. Optional lineage and
attribution retain original and converted hashes without committing raw corpora.

Added POSIX worker leases acquired before started records become visible, with
original inode/device identity checks. Recovery refuses active, missing, replaced
or legacy-unverifiable leases and appends one interrupted failure. A real killed
process is tested. Python interrupts also remain failed trials. SQLite is
authoritative; derived receipt I/O errors cannot replace committed successes;
missing copies can be repaired and altered copies cannot be silently replaced.
Added hash-verified model cards and same-protocol comparisons retaining trial and
failure counts without automatic test-based winner selection.

Extended the existing three read-only MCP tools with optional split/profile/rights
verification. Real stdio calls verify no SQLite changes, no raw rows or positions,
bounded tool lists and rejection of tampered source/licence or split evidence.
All 39 lab checks and two MCP integrations pass locally, plus lint/format and the
ten unchanged frozen task answers through fourteen actual MCP calls. Those answers
remain protocol/task verification, not an agent or strongest-incumbent benchmark.

Ran an initial and finalized cohort in separate workspaces, retaining all 24 trials
and both public receipts. Each cohort trains ML/DL on UCI Iris and White Wine
Quality across seeds 7, 19, 43, fixed split seed 2718 and 30 DL epochs. Source pages
declare CC BY 4.0; receipts retain original citations, archive/member/converted
hashes and exact changes. Final runs use the finalized package source hash.
Both Iris recipes score 30/30 test examples per seed; wine ridge RMSE is 0.719,
MLP 0.666-0.677, versus 0.859 training-mean baseline. No parameters were changed
from test feedback. These small fixed-split results do not establish broad quality
or population sampling uncertainty. Updated the coverage/requirements/backlog and
working CLI documentation. Promotion/rollback, wider data/model tracks, compute,
current MCP comparison/publication, scale and adoption remain active requirements.
Extended the existing pinned CodeQL job to include Python alongside JavaScript;
the new laboratory now receives the same security-extended static analysis gate.

## 2026-10-14: signed stacked review

Committed and pushed implementation 9bda49c under the owner identity; local SSH
signature verifies G. Opened draft PR #10 against the foundation branch, preserving
PR #9 as a separate prerequisite. All 290 factory checks passed on the updated
tree. The final full lab invocation passed 39/39, both MCP integrations passed,
and the frozen verifier retained 10/10 answers. Verified all twelve final public
runs match package fingerprint d39c84dae77351b72f5f9011f637d9be4260b8f62f4d72bc1a569cb2c608e7c5,
and the validation script hash matches the committed script. Wine's 937 duplicate
feature rows remain in one component per split; all 4,898 rows are retained.
CI is now running; merge/publication and the broader requirements remain open.

## 2026-10-14: validated data milestone

All seven checks passed on 4dc15f9: Node 20/22/24 gates, all 21 standalone server
packages, macOS CPU laboratory and both CodeQL checks. The static analysis config
now includes JavaScript/TypeScript and Python. Saved exact check links, code/MCP
hashes, local test counts and tested implementation/doc commits in the dated CI
receipt. GitHub verifies the owner signature. Marked PR #10 ready for review; it
remains stacked on open PR #9. No merge or publication took place. The subsequent
documentation receipt changes no runtime behavior. The overall goal remains
active, with release/current comparison, broader training, compute, delivery,
discovery, maintenance and adoption requirements preserved.

Read-only inspection of the existing publishing scripts found the next concrete
factory gap: npm publishing checks a committed subtree but does not require a
current benchmark/quality receipt, and treats every npm lookup failure as absence.
Repository mirroring can push directly to a server's main branch. Before using
these paths for new scale, add source-tied release readiness, distinguish unknown
registry state from a definitive missing version, and keep owner review explicit.

## 2026-10-14: continuous frozen task verification

Added the existing ten-task/fourteen-call MCP verifier to laboratory CI after
the behavioral tests and integrations. It recreates an isolated metadata-only
cohort, verifies the fixed answers over real stdio, and stores its fresh receipt
locally. This changes validation coverage, with no training/server runtime changes.
The earlier CI receipt records the preceding seven successful checks; current
head checks must additionally pass this new task step before the final handoff.

## 2026-10-14: portable frozen evaluation data

The new CI task step exposed a real portability gap: all 39 behavioral tests and
both integrations passed, but recreating the seeded smoke fixture produced a
different CSV hash on the macOS runner. Retained the failed run as evidence rather
than changing the expected answers or removing the CI step. Archived the exact
CC0 public synthetic fixture and original split file, verified against the nine
recorded real runs. The helper now checks archive/data/split hashes and copies
those exact bytes into a metadata-only workspace. No private data or model weights
are committed. This fixes frozen-corpus portability while keeping normal smoke
generation and its per-environment data hashes unchanged.

## 2026-10-14: portable task gate verified

On cecee19, all seven checks passed again. Retrieved actual macOS laboratory logs:
the copied nine-run metadata cohort and original frozen CSV produced all ten
answers through fourteen real MCP calls. Saved the successful head/check URLs,
helper and frozen archive/data/split hashes in a second dated CI receipt; retained
the original failed run. The package remains at fingerprint d39c84d, matching all
twelve finalized public-data runs. The final receipt commit is documentation only.
PR #10 remains ready and stacked on unmerged PR #9. Worktrees are clean, owner
signatures verify, and the original main checkout remains untouched. Continue with
source-tied MCP release readiness and current quality comparisons, then the rest
of the preserved laboratory/scaling requirements. Overall goal remains active.

## 2026-10-14: final data edge-case review

Review found that regression profiles compared raw target spellings when counting
conflicts: 1 and 1.0 could be reported as different despite identical numeric
targets. Corrected the profile to compare prepared target values. Also reserved a
second timestamp boundary when choosing the first time cut; large tied timestamp
groups can now form all three valid ordered partitions instead of being rejected.
Three targeted regression cases pass. The full suite is now 42/42, and both real
MCP integrations pass. The change affects data preparation; no test feedback tunes
model parameters. Re-ran the fixed twelve-run public cohort to bind evidence to
source fingerprint 17633f3a0172315349a6a595f5c811a514645ebe2d4bc0d331ddb5e39130d24e.
All results match the earlier fixed cohort. Retained all three cohorts (36 real
trials in separate workspaces), old source hashes and failed CI evidence. The new
reviewed receipt records the current source; fresh CI is required before handoff.

## 2026-10-14: completed reviewed data slice

All seven checks passed on 77b292d, including the expanded 42-test laboratory,
both real integrations, portable ten-task/fourteen-call suite, Node 20/22/24,
all 21 standalone packages and JavaScript/Python CodeQL. Saved the exact source
fingerprint/check links and verified the newest twelve-run cohort matches the
current package. Retained all 36 public-data trials and prior failure evidence.
The subsequent receipt update is documentation only. PR #10 remains reviewable;
the overall CanliLabs goal is active and no publication/maintenance count changed.

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

## 2026-10-13: verified initial milestone

All seven checks passed on implementation commit f83d50a: factory gates on Node
20/22/24, every standalone server, the macOS laboratory and both CodeQL checks.
The SQL test repair passed packaged Linux validation. The laboratory's initial
attempt stalled during checkout before any test; cancelled only that run and
retried it on a fresh runner, which passed. Saved the tested SHA and exact CI URLs
in the public evidence record. The initial laboratory/protocol foundation is
reviewable; the overall goal is still active and incomplete.

Updated the coverage matrix to reflect actual CPU/metadata implementations and
clarified the root README's shipping criteria so package availability is not
implied. The final documentation follow-up has no runtime changes. Resume by
checking the actual PR state and first unmet backlog gate, preserving all 25
requirements and the 2,000 distinct-release planning floor.

## 2026-10-14: capacity slice local verification

All 302 factory checks pass, including six meaningful impact/selection tests.
Real Git rename/deletion, missing-base fallback, orphaned server failure and
invalid CLI selections are covered. The exact immutable workflow passes
actionlint 1.7.12, whose downloaded archive hash matches its official release
metadata. Three real packages (Regex Check, SQL Check and World Time) passed
34 standalone tests, packed install and actual MCP initialize/tools-list calls.
Each retained receipt records tree, packed integrity and measured elapsed time.

Fifteen explicitly synthetic scheduling scenarios cover 21, 100, 500, 2,000
and 10,000 names. The 2,000-name full case assigns every name once in sixteen
125-package shards; the single-server case selects one and documentation none.
This measures planning, not end-to-end fleet capacity or any new release count.
Saved the source hashes and precise limitations in the local capacity receipt.
The root Node gate still checks all servers; broader maintenance and laboratory
objectives remain active. Signed stacked review and fresh remote CI follow.

## 2026-10-14: factory capacity review validated

All eight checks passed on owner-signed implementation 03dd00e: Node 20/22/24,
planner, standalone shard, stable aggregate and both CodeQL checks. Downloaded
the completed job logs and confirmed 302 factory tests, 270 tests across all
21 standalone packages, real packed MCP calls and exact committed tree parity
for every package. The serial package workload took 101,481 ms in this CI run;
this is one 21-package cohort, not capacity evidence for two thousand packages.
Saved exact check URLs, tree/integrity/timing records and raw-log hashes.

PR #12 is stacked on open #11, #10 and #9 and is ready for review. No owner merge,
publication or launch was performed. The evidence update changes documentation
only. Preserve every broader requirement: current scout/agent/performance and
release proof, full factory-gate scalability, maintained discovery/adoption,
Linux/accelerator/deeper learning, delivery and education. Overall goal active.

## 2026-10-14: locked CPU profile and local training proof

Resolved the explicit Linux CPU index with all previous declared version pins.
The lock now selects Torch 2.14.1+cpu on Linux and 2.14.1 from PyPI elsewhere,
removing the CUDA/Triton dependency branch. Pinned the already executed CPython
3.12.13 interpreter and added it to scientific source fingerprints. The runtime
guard checks exact installed versions, the platform-specific locked Torch build,
CPU tensors and absent CUDA/GPU libraries, including negative cases.

All 47 behavioral tests, lint/format and 302 factory checks pass locally. Two
real stdio integrations and ten frozen answers through fourteen calls pass.
Executed a reviewed nine-run ML/DL/RL cohort and twelve-run UCI cohort at source
ac0a7bf6fefb9b56a023ad3982f7d1b79658695d4f9e1273dc0e40cfe85f7de5.
All 21 trials succeed and reload; the initial nine trials retain their earlier
source separately. All 30 local trials and small public receipts are retained.
The recipes and model hyperparameters were not tuned from test outcomes.

The new bounded CI matrix runs macOS 15 and Ubuntu 24.04. Each platform must
pass the profile guard, all tests/integrations/frozen tasks, nine fixed default
trials and twelve public-data trials. The immutable upload action preserves only
public environment/trial/task JSON. No weights, rows or SQLite are uploaded.
The workflow passes actionlint. Actual Linux execution is still pending, so no
Linux, accelerator, production or new MCP release outcome is claimed yet.

## 2026-10-14: real Linux success and macOS bootstrap repair

Signed implementation 75dd090 is open as draft stacked PR #13. The first actual
Ubuntu job passed all 47 behavioral tests, two real MCP integrations, nine
ML/DL/RL trials, twelve registered UCI trials and ten frozen task answers through
fourteen calls. Downloaded its actual artifact and checked Linux x86_64, Torch
2.14.1+cpu, no CUDA packages, every successful trial and checkpoint reload.
Retained all public receipts and exact job/log evidence.

The macOS job failed before application checks: setup-python cannot provide
CPython 3.12.13 ARM64 for this macOS runner. Retained that failed attempt.
Changed the bootstrap to uv python install from the existing pin, followed by
managed-only sync, matching local setup. The exact interpreter version, all
application gates and model parameters remain unchanged. Actionlint and local
managed installation pass. Fresh two-platform CI is required after this repair.

## 2026-10-14: two-platform CPU laboratory verified

All ten checks pass on signed bootstrap repair 3557672: both CPU platforms,
Node 20/22/24, planner, all standalone packages, aggregate and both CodeQL checks.
Downloaded and inspected both platform artifacts and raw job logs. Each platform
passes 47 behavioral tests, two real stdio integrations and ten frozen answers
through fourteen calls, plus nine fixed ML/DL/RL and twelve registered-data trials.
All 42 new CI trials succeed and reload at exact source ac0a7bf6..., matching the
reviewed local source. Actual profiles are macOS arm64 Torch 2.14.1 and Ubuntu
x86_64 Torch 2.14.1+cpu, CPython 3.12.13, without CUDA/GPU runtime packages.

Both hosts score 30/30 Iris test examples per seed/recipe. Wine ridge RMSE is
0.719 and MLP 0.666-0.677 against the 0.859 training-mean baseline. Small floating
and seed-dependent host differences are retained; no bitwise or population
uncertainty claim is made. No model parameters changed from test feedback.
Verified 302 factory checks and 270 checks over all 21 exact standalone trees.
The public receipts retain all 93 explicit local/CI cohort trials so far, with
source boundaries and the failed macOS bootstrap; pytest fixture runs are separate.

PR #13 is ready for owner review and remains stacked on open #12/#11/#10/#9.
This final evidence/documentation update changes no executable lab source.
Linux CPU is now validated; accelerators/distributed training, checkpoint resume,
model promotion/rollback, deeper RL/foundation models, education, current MCP
qualification/publication/discovery/adoption and the maintained release floor
remain required. Overall goal stays active.

## 2026-10-14: current corpus, source corrections and measured timing

Reviewed five current time/calendar implementations using immutable source and
primary metadata. Selected broader mcp-datetime 0.2.0 at commit 7068460...,
pinning Python, its direct dependencies and packaged time-zone data. A real
dry run initializes it and lists all 17 native tools, 11,215 model-visible
characters, against five/2,924 for World Time. These are schema sizes, not
agent-token results or a global superiority claim. Structured scout retains
reported demand, source/rights/cost facts and candidate selection reasoning.

Added ten independent multi-operation questions and an official Scottish
one-off regression to the fixed corpus: 24/24 direct answers over 37 actual
stdio calls. Independent Python/IANA calculations and official calendar/clock
references check the expected values. The direct verifier's initial grading
argument mismatch was corrected; no agent result was invented.

The published government calendar exposed a real missed Scottish 15 June 2026
holiday and UK city councils incorrectly using the national/default calendar.
Added attributed OGL regional snapshots for 2026-2028 and city/province aliases.
Holiday, business-day and meeting regressions pass. The first full suite also
caught omitted substitution notes from government JSON; preserving those notes
repairs that regression. All fourteen World Time tests and both live canaries
pass, including bounded HTTPS drift comparison against all reviewed UK years.

Performance now measures actual process startup plus initialization and first
request, records repeat samples and a proper even-sample median, rejects
failed repeats and closes peers under errors/deadlines. A test caught concurrent
close completion during initialization timeout; the connector now awaits it.
Five meaningful measurement/environment tests pass. The shared peer connector
no longer copies the whole parent environment, including provider credentials.
Only system essentials and declared peer values pass. Provider behavior stays
unchanged and no paid call was made. Legacy reports are retained and their
request-only timing scope is now stated across generated READMEs.

All 307 factory checks pass on the final local source. Current live performance,
fixed source identity and direct-corpus proof are retained. Paid paired-agent
evidence, final full-tree packed qualification, reviewed owner integration and
publication remain required. All 25 objectives and release floor stay active.

## 2026-10-20: owner expansion E2

The owner expanded the goal in chat. CanliLabs will be renamed (name pending),
and becomes the umbrella for an invention lab that seeks machine-verified
discoveries in maths, physics and algorithms and later trains its own
specialist model. The MCP goals stay: the best servers in every niche, at
thousands of qualifying releases. New aims: millions of GitHub stars across all
repositories, open-source reimplementations of popular software in other
branches, and later funding plus cross-marketing from the owner's other startups.
Recorded as B01, I01, I02, A01, O01 and F01 and phases P10 to P12. "Reverse
engineering" is recorded as clean-room reimplementation only. Stars count only
from legitimate adoption. Nothing was renamed, released or spent. The repository
had 1 star, 21 source servers, 0 qualifying releases and open owner reviews #9 to #16.

## 2026-10-20: owner expansion E3

The owner added: serious breakthroughs in every niche (S01), public competitions
against the lab's baselines (C01), hundreds of specialised models (H01) and the
lab's own ARC-style AI testing and ranking system (R01). Name candidates with free
.com, .ai and GitHub names were Quantavane and Heliovane (teravane.com is taken).
The name, budget and the go for stage 0 are still waiting on the owner.
Also added: an always-on invention loop run by the lab's own models (V01) and
industry flagship models (X01). Flagship industries are to start where the owner's
companies hold data and checkers.

## 2026-10-21: name chosen and pre-launch site

The owner chose Quantavane (quantavane.com, .ai and GitHub name free on 2026-10-21, not yet registered). A
pre-launch site with a live in-browser propose, check, keep demo, waitlist and problem form is in
`~/quantavane-site` (local only, not deployed). The outreach plan is `~/quantavane-site/docs/OUTREACH.md`.
Repository rename, domain registration, waitlist storage and deployment are waiting on the owner.

## 2026-10-21: funding direction

The owner wants Quantavane to pursue funding now rather than bootstrapping alone. Plan: apply for non-dilutive
grants, compute credits and prizes immediately (AI for Math Fund, Emergent Ventures, TPU Research Cloud, research
credits, AIMO prizes when open), and approach angel investors once the first verified result exists. Investment
needs a company with the owner's parents as signatories. Once Cirrun reaches full scale, including Cirrun Host
supply, the lab runs its compute on Cirrun.

## 2026-10-21: sibling startups as first customers

The owner wants the group vertically integrated: Quantavane's models power GIMBIX, Cirrun, TraceAxiom and
CanliCapital, and those companies pay for them as customers. Each model must beat what the sibling uses today on
that sibling's own tests before it replaces it. Inter-company pricing must be written down and at fair rates. Revenue
from sibling companies is reported separately from outside revenue.
The owner confirmed that the free models Cirrun gives its users are the models this lab produces, and that lab
models must take every sibling startup to the next level. Recorded as X02.
The owner set the ultimate aim of Quantavane's own flagship general models, at the scale of Anthropic and OpenAI,
powering all sibling startups (Z01). The path is staged by funding: tuned open-weight models first, then own
pretrained models, then frontier scale.
