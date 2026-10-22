# Prepared World Time paid comparison

State: prepared; **owner paid API approval pending**. No model API call has been
made in this goal run. Original permission source: [SPEC.md](../SPEC.md),
“What only the owner can do”: “approve paid APIs”. All other CanliLabs goals stay
active while that action is pending.

Proposed action: **one attempt, up to USD 50**, using the existing first-party
Anthropic account and `claude-opus-4-8`, standard-only/global inference. Run all
24 frozen World Time tasks on both our five-tool server and immutable broader
17-tool `mcp-datetime` 0.2.0 at Git commit
`7068460121e41918c3cfb0e3ce0dc785a6697ffd`. The exact command, dependency pins,
task hashes, real tool sizes and controls are in the
[prepared plan](evidence/2026-10-14-world-time-budgeted-plan.json).

```sh
node bench/run.mjs servers/world-time --provider anthropic \
  --model claude-opus-4-8 --arm both --budget-usd 50 \
  --journal docs/goal/evidence/2026-10-14-world-time-paid-attempt.jsonl
```

Execute from `/Users/arhancanli/canlilabs-benchmark-20261014` only after the owner
approves this paid action. The fixed journal does not exist yet. Reusing it after
an attempt fails before any new model call; a restart/new allowance is not part
of this proposed attempt. Existing provider credentials remain private and are
never passed wholesale to the MCP peers or stored in the plan/journal.

The maximum protocol is 384 model requests: 24 tasks x two arms x eight turns,
with 4,000 output tokens per request. Both arms receive the same model/system and
controls. The USD 50 ceiling applies to this one attempt, including conservative
usage charges and unresolved reservations. Each request needs USD 12.702912
available; successful verified usage refunds unused exposure. The cap is not a
prediction that all worst-case requests fit. Exhaustion or unknown charges stop
the attempt; partial task evidence cannot qualify a release. There is no automatic
paid retry, model fallback or subsequent attempt.

Primary pricing checked 2026-10-14: input USD 5/million, output USD 25/million,
one-hour cache writes USD 10/million and cache reads USD 0.50/million. The profile
uses the full-context ceiling and a 20% margin. The published profile expires on
2026-10-21 UTC and requires a fresh review then. See [the model overview](https://platform.claude.com/docs/en/models/opus-4-8/overview)
and [pricing details](https://platform.claude.com/docs/en/about-claude/pricing).
Opus 4.8 is an active legacy model and remains this runner's previous default;
no current strongest-model or global best-server claim is implied.

Free preparation already proves both actual peers initialize/list their full
native tool sets, and the current source's 24 fixed answers pass through 37 real
MCP calls. Technical qualification and live performance are independently recorded.
The paid run must still prove current paired accuracy/token/additional coverage
under the original release rules. Review its complete raw report, including wrong
answers and tool traces, before deciding eligibility. Owner source/repository
integration, publication/provenance/Registry assets, directory listings, scale,
maintenance and adoption remain separate required work.
