# Requirements and completion evidence

Source O: original `docs/SPEC.md`. Source E: owner expansion on 2026-10-13.
Status is deliberately evidence-based. Infrastructure that enables a requirement
does not by itself complete it. The acceptance targets below are engineering
criteria chosen to make the owner's ambitions reviewable.

| ID | Source | Objective | Completion evidence | State |
| --- | --- | --- | --- | --- |
| G01 | E | Preserve all goals and structured continuity | Requirement ledger, phases, verified status, decision log, repository continuity instructions, registered active goal | Complete; continued upkeep required |
| M01 | O,E | Thousands of distinct useful MCP servers across niches | At least 2,000 maintained published versions; distinct scout evidence and task coverage; count derived from release receipts | Planned |
| M02 | O,E | Be the best available in each niche | Fixed independent tasks against the strongest current alternative; no accuracy regression; lower token use or measured additional coverage; dated raw results and uncertainty | In progress |
| M03 | O | Scout demand and winnability before building | Per-niche demand, incumbent, licences, API cost/rate limits, rejection reasons, task corpus; periodic refresh | In progress |
| M04 | O | Small, stable tool lists and compact results | Bounded inputs, output schemas, accurate annotations, stable lists within budgets, explicit truncation, cache and cost measurements | Local gate revalidated; ongoing measurement required |
| M05 | O | Correctness and protocol compatibility | Recorded golden tests, negative cases, real SDK stdio and HTTP client calls, weekly canaries, packaged-install tests | Implemented; gaps under audit |
| M06 | O | Safe, bounded upstream access | Declared HTTPS hosts, redirect/DNS checks, deadlines, size caps, bounded idempotent retries, safe errors; HTTP Origin/Host protection tested | In progress |
| M07 | O | Easy independent installation and provenance | npx, desktop bundle, Docker, pinned locks, per-server repo parity, npm provenance, signed bundles, official Registry record | Under audit |
| M08 | O | Distribution, discovery and compositions | Verified Registry and directory listings; searchable catalog/router; bounded discovery that does not load thousands of tool lists; integration examples | Planned |
| M09 | O | Real adoption and ongoing maintenance | Weekly downloads/stars/issues/listings/canary metrics with dates; user issue response tracking; owner-ready launch materials; no invented users | Planned |
| M10 | O | Owner identity, brand and credit | Existing owner signing and credit gates retained; consistent Canli Labs branding; no unauthorized launch posts | Local credit/brand gate passed; signing/review in progress |
| M11 | E | Scale engineering without reducing quality | Changed-server CI with global kit/scaffold impact detection, bounded concurrency, capacity evidence, versioned gates, maintenance budgets | Planned |
| D01 | E | Reproducible data foundation | Immutable content hashes, source/licence/use rights, schema/quality profiles, explicit split manifests, train/eval leakage checks, versioned lineage | Registered tabular profiling/lineage and random/group/time guards validated; wider data paths pending |
| D02 | E | Data pipelines and high-quality corpora | Ingestion, cleaning, deduplication, annotation, filtering, storage/streaming recipes, privacy handling and measured quality by modality | Planned |
| L01 | E | Classical machine learning | Runnable train/evaluate/export recipes with baseline comparisons, held-out evaluation, reloadable artifacts and receipts | Registered binary/multiclass classification and ridge regression validated; ensembles/other recipes pending |
| L02 | E | Deep learning | Runnable PyTorch recipes, deterministic seed controls, checkpoints, training curves, held-out evaluation, reload verification and accelerator support | CPU MLP classification/regression on registered data validated; accelerators/modalities pending |
| L03 | E | Reinforcement learning | Versioned environments, correct terminal/truncation handling, seeded independent evaluation, random-policy baseline, checkpoints, reward reports across seeds | Tabular control validated across three seeds; deeper methods pending |
| L04 | E | Foundation models and post-training | Model licences, tokenization, SFT, parameter-efficient tuning, preference optimization and reward-learning recipes; measured improvement on uncontaminated tasks | Planned |
| L05 | E | Broad model and learning disciplines | Coverage matrix completed with a runnable recipe, documented limitations, baseline and evaluation for each agreed discipline | Planned |
| L06 | E | Scientific experiment tracking and model registry | Unique immutable runs, code/environment/data hashes, seeds, all trial counts, metrics/artifacts, failed-run records, comparison and promotion history | Append-only ledger, protocol comparisons, model cards, atomic receipts and safe interruption recovery validated; promotion/history pending |
| L07 | E | Evaluation and reliable model selection | Split isolation, baseline/ablation suites, multiple seeds, uncertainty, contamination checks, robustness/fairness/calibration where relevant; no tuning on final tests | Smoke and fixed public multiclass/regression cohorts validated; group/time/duplicate checks tested; broader suites pending |
| L08 | E | Reproducible compute and efficient training | Locked environments, CPU smoke path, profiled accelerator recipes, resource limits, budget estimates, recovery/checkpoint tests, explicit cloud-cost decisions | Locked bounded CPU path validated; Linux/accelerator/distributed work pending |
| L09 | E | Research education and accessible workflows | Progressive ML/DL/RL learning paths, working tutorials, notebooks or CLI recipes, explanations, exercises and reproducible examples | Working CLI examples documented; full curriculum pending |
| L10 | E | Model delivery and production operations | Reloaded-model inference, evaluation-based promotion, rollback, documented deployment, health/latency/cost checks and monitoring | Local inference with original labels and variable feature counts plus verified model cards validated; promotion/production pending |
| L11 | E | Connect the laboratory with MCP | Narrow tools for dataset inspection, experiments, evaluations and model discovery; permissions and resource limits; conformance and task tests | Three read-only tools, split/rights/profile verification and ten frozen answers validated; agent comparisons/release pending |

Every closure must link to actual artifacts, code/version, execution environment,
measurement date, passing checks, and material limitations. A local CPU smoke run
does not close a distributed-training or production-serving objective.
