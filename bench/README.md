# MCP agent comparisons

The runner compares a fixed corpus on our server and its recorded incumbent,
using one model and system prompt. Both arms run sequentially. It records graded
answers, actual tool choices, token usage, resolved model and latency with source,
task, incumbent and runner hashes. Existing historical results remain unchanged.

Prepare a free plan that initializes/lists both real MCP peers:

```sh
node bench/run.mjs servers/world-time --dry --budget-usd 50 \
  --journal docs/goal/evidence/2026-10-14-world-time-paid-attempt.jsonl
```

Dry execution creates no model client, paid request, journal or benchmark result.
The JSON plan records the executable incumbent identity, task IDs, real tool sizes,
request limits and proposed allowance. It does not predict the eventual API bill.
The [World Time run packet](../docs/goal/BENCHMARK-RUN.md) identifies the concrete
next paid action and its existing owner approval requirement.

Once the owner approves that paid attempt, run the same command without `--dry`.
Ordinary paid execution requires an explicit financial policy. The verified
`--budget-usd` profile currently supports `anthropic/claude-opus-4-8` only; existing
provider paths and defaults remain. An owner-approved legacy invocation for an
unpriced provider can use explicit `--unbudgeted --journal <new-path>` and carries
no calculated cap. No provider or model was migrated for this change.

The dated price profile expires after seven days. Budgeted requests pin the
first-party HTTPS endpoint, standard-only service and global inference, disable
automatic SDK retries and use a two-minute request timeout. SDK environment header
overrides are rejected for this profile. Each response must identify the priced
model and valid usage within its context/output limits. Unexpected service/region/
server-tool fees, missing usage or failed requests stop the attempt.

Accounting uses integer micro-dollars. A request reserves **USD 12.702912**:
a conservative 1,048,576-token context ceiling at the highest published cache-write
price, up to 4,000 output tokens and a 20% margin. Verified usage releases unused
exposure; every cache write is charged at the one-hour ceiling and fractional
micro-dollars round up. This is a conservative usage ceiling, not an invoice.
The runner stops before issuing a request if remaining allowance cannot cover
its complete reservation. A cap can therefore stop a corpus before completion.

An exclusive journal is flushed before each model request and after each usage
settlement/completed task. Unknown charges retain their full reservations.
Reusing that path fails before another model client/request and cannot silently
reset the attempt's allowance. There is no automatic resume or new paid attempt.
Place it outside server source, or in derived `bench/results`, so journaling
cannot change the measured input. The journal contains no request headers or
credentials. API failures record error types without copying upstream bodies.

Budget/model interruptions retain completed rows and reservations, close the MCP
peer and write no new complete benchmark or README result. Only a fully completed,
source-unchanged comparison creates its normal `canlilabs.benchmark.v2` report.
Final result-save errors remain recorded for inspection before retrying. A journal
is partial execution evidence, not a benchmark certificate or release.

Current [model prices](https://platform.claude.com/docs/en/models/opus-4-8/overview),
[full-context/feature prices](https://platform.claude.com/docs/en/about-claude/pricing)
and [Messages controls](https://platform.claude.com/docs/en/api/messages/create)
were checked on 2026-10-14. Opus 4.8 remains the existing legacy-model default;
this comparison does not claim it is the strongest current agent model.
