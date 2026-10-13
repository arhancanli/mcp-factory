# MCP pilot evaluation

`questions.xml` contains ten independent read-only tasks over the frozen nine-run
validation cohort. Every question needs multiple metadata calls or a run plus its
dataset. Answers were verified against the actual recorded runs, not invented
model results. No task changes records, launches training or returns private data.

Create an isolated replica of the public metadata and its synthetic data fixture:

```sh
uv run --frozen --project lab python lab/scripts/prepare-evaluation.py \
  --workspace .lab/evaluation-v1
CANLILABS_WORKSPACE="$(pwd)/.lab/evaluation-v1" node lab/mcp-server.mjs
```

`node lab/scripts/verify-evaluation.mjs .lab/evaluation-v1` verifies all ten answers
through real stdio MCP and writes a dated receipt. Existing receipts are protected
against replacement; use a new receipt path for a later measurement.

Point the evaluation client at that server. The replica preserves original run
IDs, configuration, provenance and results. It does not claim to retrain models
or include their weights. Use a fresh empty destination; evaluating a growing
production ledger would make the answers unstable.

Task answers are verified. An automated protocol integration test also exercises
the tools over actual training output. Agent task accuracy, latency and token
cost against an incumbent have not yet been measured. The pilot therefore does
not qualify as a released benchmark winner.
