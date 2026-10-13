# Next bounded work

This queue preserves the full goal while keeping the next implementation step
specific. Complete a deliverable and its checks before repeating a measurement.
Change the queue when actual evidence changes its priority.

| Priority | Work | Acceptance and dependency |
| --- | --- | --- |
| 1 | Review and integrate the laboratory/HTTP/SDK foundation | Signed commit, 290 factory checks, standalone installs/tests, lab tests and stdio integration, CI; retain the full goal as active |
| 2 | Repair current canary deficits | Recall Check and Release Notes have failing recent remote canaries; reproduce, distinguish transient upstream failures from bugs, add targeted regression coverage, deploy fixes through review |
| 3 | Close benchmark and release gaps in the existing 21 | Five missing agent comparisons; remeasure changed implementations; verify repo parity, release assets/provenance and npm/Registry publication; owner initial npm login/confirmation follows existing publishing flow |
| 4 | Make the general data path trainable | Explicit numeric/tabular schemas, versioned input/splits, group/time split options, deduplication and target leakage checks; train on registered external datasets without changing the smoke fixture |
| 5 | Extend the model/experiment lifecycle | Atomic artifact receipts, recovery of interrupted runs, training comparison without tuning final tests, model/dataset cards, promotion history and rollback |
| 6 | Qualify useful laboratory MCP servers | Scout dataset/split verification, experiment reproducibility audit and evaluation-metric verification as distinct candidate niches; measure the strongest incumbents before build/release |
| 7 | Support Linux CPU and accelerators | CPU-specific Torch lock path, Linux CI, then hardware-specific GPU profiles, checkpoint resume tests and documented budgets |
| 8 | Grow the first measured server cohort | New scout records and independently useful task corpora; require original build/gate/benchmark/ship stations; measure maintenance capacity before growing to 100 |
| 9 | Search and route the collection | Ranked tool/server discovery with bounded pagination; test retrieval on held-out tasks; measure token cost and stale-version handling |
| 10 | Extend research and teaching tracks | Add regression/ensembles, vision/text models, deep RL and foundation-model tuning, then every COVERAGE.md discipline with a recipe and evaluation |

The new candidate niches in priority 6 are proposals, not proven demand or
benchmark wins. A strong official incumbent can cause rejection or change scope.
The 100, 500 and 2,000 release milestones retain their quality gates. No arbitrary
deadline or GPU budget has been invented.
