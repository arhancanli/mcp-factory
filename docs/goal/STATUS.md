# Current status

Updated: 2026-10-14 (Asia/Dubai). Overall goal: active; incomplete.

Repository: `arhancanli/mcp-factory`. Actual `origin/main`: `e52f29f`.
Active worktree: `/Users/arhancanli/canlilabs-data-20261014`.
Branch: `codex/canlilabs-data-lifecycle-20261014`, based on foundation head
`cd1dabf`. The original checkout remains clean on main. Foundation
[PR #9](https://github.com/arhancanli/mcp-factory/pull/9) is open, ready for review
and unmerged; all seven checks passed on its final head. The data/lifecycle slice
is owner-signed at `9bda49c` and open as stacked
[PR #10](https://github.com/arhancanli/mcp-factory/pull/10), ready for review.
All seven checks passed on `4dc15f9`, and GitHub verifies its owner signature.
It depends on PR #9 and is not merged or published. Exact check URLs and the tested
source are in [data-ci-validation.json](evidence/2026-10-14-data-ci-validation.json).

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

Local checks: 39 behavioral lab tests, two real stdio integrations, lint/format,
290 factory checks and ten frozen task answers through fourteen MCP calls.
Lab lint/format, behavioral tests and integrations passed in macOS CI, with Node
20/22/24 gates, all 21 standalone packages and JavaScript/Python CodeQL. The ten
frozen task answers also passed locally and are now added as a required lab CI step.
These task answers are not an agent/incumbent benchmark. The final validation
follow-up changes no training/server runtime files; verify current PR checks on resume.

Two separate twelve-run public cohorts are retained. The final cohort in
[registered-data-runs.json](evidence/2026-10-14-registered-data-runs.json) uses
fixed seeds 7/19/43, split seed 2718, default ML parameters and 30 DL epochs.
Both recipes achieved 30/30 Iris test predictions per seed against a 1/3 majority
baseline. On 967 held-out Wine Quality examples, ridge RMSE was 0.719 and MLP RMSE
0.666-0.677, against 0.859 for the training-mean baseline. All checkpoints reloaded.
These are two small public tasks on fixed splits, not population uncertainty,
strongest-model evidence or production qualification. Both source pages declare
CC BY 4.0; receipts retain creator attribution and conversion lineage. No data or
weights are committed. The initial cohort is kept separately with its earlier
source hashes; the final receipt ties runs to the finalized package source.
Its exact package fingerprint is
`d39c84dae77351b72f5f9011f637d9be4260b8f62f4d72bc1a569cb2c608e7c5`;
verified against the signed implementation. Iris has one duplicate feature row;
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
