# Factory check capacity

The factory still runs its full Node 20/22/24 gate, including every server's golden
tests, live stdio tool-list inspection, template probe, catalog and credit checks.
This first capacity slice changes the independent packed-install station only.
Per-server factory-gate sharding remains necessary before a large collection can
be called operationally qualified.

`scripts/ci-plan.mjs` selects package checks from the complete committed Git diff
of the PR base and checkout. It does not use GitHub's paginated changed-file API
or workflow path filters. NUL-separated paths and disabled rename detection
preserve deletions and both sides of renames. An unavailable base or diff expands
to a full check. A server directory without a committed package file fails.

| Change | Independent package checks |
| --- | --- |
| Files inside one server | That server |
| One server's source or rendered launch material | That server |
| Kit, templates, scripts, gates, benchmarks or workflows | All servers |
| Package/Registry metadata, catalog, root README or dependencies | All servers |
| Removed server or an unrecognized path | All remaining servers |
| Factory documentation or laboratory files only | None; the full factory gate continues |
| Main push, weekly schedule, manual run or `--all` | All servers |

The planner emits at most sixteen deterministic shards, targeting sixty-four
packages each, with four concurrent standalone workers. Large collections increase
the per-shard size rather than dropping packages or exceeding the configured job
count. Each worker installs, tests, packs, installs the packed artifact and makes
real MCP initialize and tools-list requests for every assigned name. An explicit
empty, duplicate, unknown or malformed selection fails rather than falling back
to an accidental full run or a successful no-op. Shards continue after peer
failures; the stable `Every server works as its own repository` check fails if the
planner or any required shard fails, is cancelled or is unexpectedly skipped.

The matrix and concurrency controls follow the [GitHub workflow documentation](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax).
The sixteen-shard limit stays below GitHub's documented 256-job matrix limit.
Workflow actions retain the existing immutable pins and read-only permissions.

Local inspection and full execution:

```sh
node scripts/ci-plan.mjs --base <full-base-sha>
node scripts/ci-plan.mjs --all
node scripts/check-standalone.mjs
node scripts/check-standalone.mjs --names-json '["world-time"]'
```

Every successful package check logs a receipt containing its final Git tree,
actual test count, MCP request results, packed SHA-512 integrity and elapsed time.
Planning simulations for 100, 500, 2,000 and 10,000 names verify scheduling only:
they create no servers, perform no package installs and prove no maintenance or
release count. Actual end-to-end fleet throughput and failure/retry costs must be
measured on real qualified cohorts before increasing the release count.
