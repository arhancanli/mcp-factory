# Evidence records

`2026-10-13-factory-audit.json` is a read-only snapshot of the recovered 21-server
catalog and current public endpoints. It distinguishes implemented source,
historical benchmark files, npm version lookups, repository/release existence,
Registry search matches and last canary conclusions. A timeout is an unknown,
not proof of absence. Signature verification and exact repository tree parity
are deliberately false until independently checked.

`2026-10-13-lab-runs.json` records nine actual smoke training runs, three seeds
per recipe, with metrics, baselines, environment/source/data hashes and checkpoint
reload verification. It is a validation cohort; every attempt is additionally
recorded in the local ledger, including earlier runs and any failures. The receipts
contain no dataset rows or model weights. Their claims apply to the recorded
source hash and synthetic tasks.

`2026-10-13-factory-audit-second.json` retains HTTP status/error distinctions and
rechecks uncertain release lookups. `2026-10-13-lab-final-runs.json` is a second
nine-run cohort after the read-only reader was implemented. Its source hashes
include the reader. The local ledger contains 19 total attempts at recording;
the nine runs are explicitly a cohort rather than all experiment activity.

`2026-10-13-mcp-answer-verification.json` verifies the ten frozen read-only task
answers through real stdio MCP. It is not a measured agent or incumbent benchmark.

`2026-10-13-standalone-validation.json` records the owner-signed implementation
commit, all 21 standalone packages, their 270 passing server tests, and packed
package initialization. It was generated from the completed validation command.

`2026-10-13-ci-validation.json` records all seven successful PR checks on the
final implementation commit, including the corrected SQL test and laboratory
retry, with exact GitHub check URLs.

Later receipts should use a distinct dated name rather than silently replacing
an older measurement. CI and PR references are added to STATUS.md after execution.
