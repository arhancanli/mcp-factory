# Current status

Updated: 2026-10-13. Overall goal: active; incomplete.

Repository: `arhancanli/mcp-factory`. Recovered base: `e52f29f` on `origin/main`.
Active branch: `codex/canlilabs-foundation-20261013`. Worktree:
`/Users/arhancanli/canlilabs-goal-20261013`. The original checkout remains on main.
Implementation commit `d5f1ae2` is owner-signed (verified locally). Review:
[PR #9](https://github.com/arhancanli/mcp-factory/pull/9), currently draft.
Standalone validation passed all 21 servers, 270 server tests, and packed-package
initialization. Laboratory CI and CodeQL passed on the implementation commit.
Factory PR CI exposed an existing owner-email allowlist issue on GitHub's verified
temporary merge commit; the allowlist is being corrected before rerunning CI.

## Implemented and verified locally

- Durable goal, 25 requirement IDs, nine-phase-plus-recovery roadmap, full model
  coverage matrix, prioritized backlog and home/repository continuation rules.
  Original MCP quality, distribution, adoption and maintenance goals are preserved.
- Python 3.12 package and locked environment; real CPU logistic-regression, PyTorch
  MLP and FrozenLake Q-learning recipes; held-out/independent evaluation and baselines;
  checkpoint save/reload verification; bounded inference.
- Content-addressed CSV data with source/licence metadata and schema bounds,
  explicit splits, duplicate-content/identity leakage checks and tampering guards.
- Append-only local trial ledger with unique IDs, failures, configs, seeds,
  source/dependency/data/split hashes, metrics and artifact hashes.
- Three read-only MCP pilot tools for listing/inspecting experiments and checking
  dataset provenance/hash. Real stdio integration verified no database modification.
- Shared HTTP now binds loopback by default, validates Host and Origin before
  creating a context, requires explicit trusted hosts for remote binding, and keeps
  bodies/connections bounded. Unexpected error details are withheld from logs.
- MCP SDK upgraded from 1.30.1 to 1.32.1 across the factory/template/21 server
  manifests; regenerated all shrinkwraps and synchronized vendored kit/docs.
  Root npm audit reports zero vulnerabilities. The advisory concerns SDK OAuth
  clients; the server implementations themselves were not claimed exploitable.
- Existing factory baseline: 287/287 checks. Updated factory: 290/290 checks.
  Laboratory: 14/14 behavioral tests. MCP stdio integration: 1/1. Frozen pilot
  task answers: 10/10 verified through 14 real MCP calls. Agent/incumbent evaluation
  of the pilot has not been executed.

Nine final validation runs across seeds 7, 19, 43 are recorded in
[lab-final-runs.json](evidence/2026-10-13-lab-final-runs.json). Classical ML test
accuracy was 87.9%; MLP test accuracy was 96.3-97.1%, against a 50.4% majority
baseline on the fixed synthetic classification fixture. Tabular policies achieved
200/200 successes per seed on the small deterministic RL environment, against
3/200 for each random baseline. These are smoke-task results, not general model
or research-performance claims. The main local ledger held 19 total attempts when
the nine-run final cohort was recorded. Temporary test ledgers are separate.

## Actual factory/release gaps

The [second public audit](evidence/2026-10-13-factory-audit-second.json) inspected
21 source/catalog entries, 21 performance files and 16 agent benchmark directories.
Five lack agent comparison results: Config Check, Dockerfile Check, Kube Check,
Regex Check and SQL Check. Twelve servers meet the audit's basic historical
accuracy/token comparison calculation in at least one result; this does not prove
the strongest current incumbent or every full shipping criterion.

All 21 exact npm version lookups returned missing packages; no npm publication is
being claimed. No matching Registry versions were verified. Most Registry queries
timed out and remain unknown, while completed unmatched searches are recorded
separately. Repository tree parity and release signatures are unverified.

The audit observed 18 successful last canaries, two failures (Recall Check and
Release Notes), and one unknown query (SQL Check). SQL Check's earlier audited
canary had succeeded. Recall Check's full live canary passed locally during triage;
its remote failure has not been treated as fixed or hidden. Release Notes returns
the correct version but its canary hard-coded a date removed from Express's
current History.md. Its stable version/deprecation assertion was repaired, with
an undated-heading/registry-date regression test (10/10 server tests). A subsequent
live attempt encountered an upstream timeout. After improving error diagnosis and
cleanup, its next full live canary passed. Both originally failing remote canaries
now pass locally; deployment and later remote health remain separate evidence.

Open upstream PRs #3-#8 were dependency updates at recovery and have not been merged
here. This branch implements the SDK pin proposed in #4 as part of its tested
foundation; it does not merge that PR. Initial npm publishing uses the existing
owner browser-confirmation/Trusted Publisher workflow, after quality evidence.

## Next work

Finish signed review/CI and standalone package checks, record their exact results,
then follow [BACKLOG.md](BACKLOG.md): close canary/benchmark/publication deficits;
add trainable registered data and lifecycle/recovery; qualify lab/data MCP niches;
add Linux/accelerator/deep-RL/foundation-model paths; scale through 100, 500, 2,000
distinct qualifying releases. The pilot is not counted as a standalone release.
All broad learning tracks and sustained adoption/maintenance objectives remain
active in REQUIREMENTS.md and COVERAGE.md.
