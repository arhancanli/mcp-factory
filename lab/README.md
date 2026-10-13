# CanliLabs local laboratory

Real CPU training recipes for classical ML, PyTorch deep learning and tabular
reinforcement learning, with held-out evaluation, checkpoints, reload verification,
dataset provenance and an append-only experiment ledger. This is the first
executable laboratory milestone. The full [goal](../docs/goal/README.md) includes
larger data pipelines, foundation models, broader learning methods and production
operations that remain in progress.

From the repository root:

```sh
uv sync --frozen --project lab
uv run --project lab canlilabs --workspace .lab train ml --seed 7
uv run --project lab canlilabs --workspace .lab train dl --seed 7
uv run --project lab canlilabs --workspace .lab train rl --seed 7
uv run --project lab canlilabs --workspace .lab runs
uv run --project lab canlilabs --workspace .lab show <run-id>
```

Python 3.12 is the validated interpreter. Dependencies and artifact hashes are
locked in `uv.lock`; each run also records exact installed versions and source
hashes. The first CI job validates macOS CPU execution. Linux CPU wheels and
accelerator/distributed environments are separate upcoming validation work; the
current PyPI Linux Torch distribution includes CUDA dependencies.

The ML recipe fits a StandardScaler and logistic regression on training data.
The DL recipe trains a small MLP and selects its checkpoint using validation loss.
Both use the same generated classification fixture: 720 training, 240 validation,
240 test examples. The test split does not select the checkpoint or preprocessing.
A majority-label baseline is selected from the training split. Model reload must
reproduce the final predictions before a run succeeds.

The RL recipe trains a Q-learning table on deterministic 4x4 FrozenLake. Training
episodes and independent evaluation use separate seed ranges. Time-limit
truncation allows bootstrapping; an absorbing terminal state does not. Evaluation
reports reward, success rate, a 95% Wilson interval, episode length and a random
policy baseline. This is a small functional environment; it does not demonstrate
performance on difficult RL tasks or implement deep RL.

Default runs are bounded: DL 30 epochs, RL 1,500 training episodes and 200 evaluation
episodes. CLI limits cap epochs, episodes, seed range and prediction size. The
synthetic data fixture is identified explicitly and assigned CC0-1.0 by its owner;
it does not represent a collected production corpus.

Register a local CSV with an explicit source and licence:

```sh
uv run --project lab canlilabs --workspace .lab register-data examples.csv \
  --source "owner-provided:examples" --license CC0-1.0 --target label
```

Registration supports complete CSV files up to 16 MiB and 100,000 rows. It stores
immutable bytes by SHA-256 and refuses missing schema fields, changed stored
content or conflicting source/licence metadata. A declared licence records the
registrant's statement; it does not independently verify training rights. General
CSV training and modality-specific ingestion are upcoming recipes. Current
training commands intentionally use the reproducible smoke fixture.

Local datasets, checkpoints and the experiment database live in `.lab/`, which is
ignored by Git. Every valid training attempt is registered before training starts.
Failures remain visible. Database constraints prevent changing or deleting run
records or replacing their final state. Started runs remain identifiable if a
process is interrupted; crash recovery and administrative archival are future work.

Inference loads only registered artifacts with matching hashes:

```sh
uv run --project lab canlilabs --workspace .lab predict <ml-or-dl-run-id> \
  --rows '[[0,0,0,0,0,0,0,0,0,0,0,0]]'
uv run --project lab canlilabs --workspace .lab predict <rl-run-id> --rows '[0,1,2]'
```

The local MCP pilot exposes three metadata tools: `lab_list_experiments`,
`lab_get_experiment`, and `lab_inspect_dataset`. It uses SQLite read-only mode,
bounded queries and subprocess outputs. It cannot launch training, run inference,
change records or return dataset rows/model weights.

```sh
npm ci --ignore-scripts
CANLILABS_WORKSPACE="$(pwd)/.lab" node lab/mcp-server.mjs
```

For an MCP client, configure an absolute path to `lab/mcp-server.mjs`:

```json
{
  "mcpServers": {
    "canlilabs-lab": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-factory/lab/mcp-server.mjs"],
      "env": {
        "CANLILABS_WORKSPACE": "/absolute/path/to/your/.lab"
      }
    }
  }
}
```

The pilot uses the lab's virtual-environment interpreter. Set `CANLILABS_PYTHON`
to an explicit installed interpreter when needed. It is not counted as a published,
standalone benchmark winner; those release gates remain to be completed.

Validation:

```sh
uv run --project lab ruff check lab/src lab/tests
uv run --project lab ruff format --check lab/src lab/tests
uv run --project lab pytest -q lab/tests
npm run test:lab-mcp
```

Tests train real models, reproduce seeds, verify held-out improvement and artifact
reloads, reject cross-split duplicate data and tampered checkpoints, preserve failed
trials, and read a trained run through real MCP stdio without modifying its database.
Public execution receipts live in `docs/goal/evidence/`; weights and datasets stay
local.
