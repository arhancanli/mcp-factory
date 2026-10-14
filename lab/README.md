# CanliLabs local laboratory

Real CPU training recipes for classical ML, PyTorch deep learning and tabular
reinforcement learning, with registered data, held-out evaluation, checkpoints,
reload verification, provenance, model cards and recoverable experiment records.
The full [goal](../docs/goal/README.md) includes
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

The CPU qualification profile pins CPython 3.12.13 in `.python-version`.
Dependencies and artifact hashes are locked in `uv.lock`; each run also records
exact installed versions and source hashes. Linux selects the official Torch
CPU index, while macOS uses its CPU PyPI build. Unrelated packages continue to
use PyPI. CI now checks macOS 15 and Ubuntu 24.04, with actual installed-build
inspection, all behavioral tests, real MCP integration and frozen task answers.
Both platform jobs pass: macOS arm64 and Ubuntu x86_64 each execute 47 behavioral
tests, two real MCP integrations, ten frozen task answers and all 21 fixed
synthetic/RL/public-data trials, with checkpoint reloads. CI uses uv's managed
interpreter from the pin. The [CPU receipt](../docs/goal/evidence/2026-10-14-linux-cpu-ci-validation.json)
records exact code, profiles and check URLs. Accelerator/distributed environments
remain separate tracked work.

Inspect and reproduce the CPU qualification in a new empty workspace:

```sh
uv run --project lab python lab/scripts/verify-cpu-environment.py
uv run --project lab python lab/scripts/validate-cpu.py \
  --workspace .lab/cpu-example --receipt .lab/cpu-example.json
```

The environment guard rejects a different interpreter, declared dependency
version, CUDA build, GPU runtime package or non-CPU default tensor device. The
cohort retains all nine ML/DL/RL attempts at seeds 7, 19 and 43, checks artifact
hashes and reload verification, and applies the existing fixed smoke criteria.
Its receipt records exact source, lock, interpreter, actual dependency versions,
metrics and failures. This is small synthetic classification and deterministic
FrozenLake; cross-platform bitwise identity and broader model performance are
not claimed. The separate public-data cohort below checks registered multiclass
classification and regression on each CI platform. CI uploads only these public
JSON receipts; model weights, rows and SQLite databases remain on the runner.

The ML recipe fits a StandardScaler and logistic regression for classification,
or ridge regression for numeric targets. The DL recipe trains an MLP and selects
its checkpoint using validation loss. Feature preprocessing and regression target
scaling use training data only. A majority-label or training-mean baseline provides
a comparison. Checkpoint reload must reproduce predictions before a run succeeds.
With no dataset options, both recipes retain the generated classification fixture:
720 training, 240 validation and 240 test examples.

The RL recipe trains a Q-learning table on deterministic 4x4 FrozenLake. Training
episodes and independent evaluation use separate seed ranges. Time-limit
truncation allows bootstrapping; an absorbing terminal state does not. Evaluation
reports reward, success rate, a 95% Wilson interval, episode length and a random
policy baseline. This is a small functional environment; it does not demonstrate
performance on difficult RL tasks.

The `dqn` recipe learns a neural action-value function on CartPole-v1 using the
same locked CPU environment. A bounded 10,000-transition replay ring, target
network, Huber loss and clipped gradients stabilize updates. Absorbing terminal
transitions stop bootstrapping; external time limits retain their actual final
observation and bootstrap target. The simulator version, implementation hash,
reward convention and independent reset/action seeds are recorded. Training uses
one CPU thread, 20,000 environment steps by default, a maximum 100,000 steps and
a 300-second trial deadline. It adds no dependencies or model downloads.

```sh
uv run --project lab canlilabs --workspace .lab train dqn \
  --seed 7 --training-steps 20000 --evaluation-episodes 50
uv run --project lab canlilabs --workspace .lab predict <dqn-run-id> \
  --rows '[[0,0,0,0]]'
uv run --project lab python lab/scripts/validate-deep-rl.py \
  --workspace .lab/deep-rl-example --receipt .lab/deep-rl-example.json
```

Checkpoint selection evaluates four evenly spaced training checkpoints on 20
fixed validation resets and retains the earliest highest-return policy. Final
test resets are separate from training and validation. A random policy uses
the same final reset seeds with a separate action stream. Evaluation runs only
the reloaded policy and reports all episode returns in a hash-verified artifact,
mean/std/min/max returns and a paired bootstrap interval for improvement over
random. That interval describes reset variation for one fixed policy; it does
not estimate training-seed or task-population uncertainty. Learning curves retain
every completed training episode, the partial episode at the step limit, sampled
losses and every validation episode. Weights-only loading and artifact hashes
protect the local inference path.

The validation command fixes training seeds 7/19/43, 20,000 steps, 50 final
evaluation episodes and functional criteria before its cohort runs: each policy
must average at least 100 return and exceed random by more than 50. It preserves
all attempts and raw final returns. These criteria establish functional learning
on one small environment; they do not declare CartPole solved or establish the
best RL algorithm. Hyperparameters are not tuned from final test outcomes.
Both CPU CI platforms require this cohort in addition to the existing ML/DL/RL
and public-data cohorts. The MCP pilot can list `dqn` and inspect bounded run
metadata, without executing the policy or returning transition data/weights.

The implementation follows the algorithmic guidance in the
[PyTorch DQN tutorial](https://docs.pytorch.org/tutorials/intermediate/reinforcement_q_learning.html)
and [Gymnasium time-limit guidance](https://gymnasium.farama.org/tutorials/gymnasium_basics/handling_time_limits/).
[CartPole documentation](https://gymnasium.farama.org/environments/classic_control/cart_pole/)
describes observations, actions and episode endings. Gymnasium's MIT-licensed
simulator generates these trajectories; no external corpus is downloaded.

Default runs are bounded: DL 30 epochs, RL 1,500 training episodes and 200 evaluation
episodes. CLI limits cap epochs, episodes, seed range and prediction size. The
synthetic data fixture is identified explicitly and assigned CC0-1.0 by its owner;
it does not represent a collected production corpus.

Register a local CSV with an explicit source, licence and target:

```sh
uv run --project lab canlilabs --workspace .lab register-data examples.csv \
  --source "owner-provided:examples" --license CC0-1.0 --target label \
  --attribution "Dataset created by the owner"
uv run --project lab canlilabs --workspace .lab prepare-data \
  --dataset-id <dataset-id> --features height weight --task classification
uv run --project lab canlilabs --workspace .lab train ml \
  --dataset-id <dataset-id> --features height weight --task classification
uv run --project lab canlilabs --workspace .lab train dl \
  --dataset-id <dataset-id> --features height weight --task classification
```

Registration supports complete CSV files up to 16 MiB and 100,000 rows. It stores
complete bytes atomically by SHA-256 and refuses missing fields, changed content
or conflicting source/licence metadata. Optional `--lineage lineage.json` records
original hashes and transformations. A declared licence records the registrant's
statement; it does not independently verify training rights.

Local training supports 10-20,000 rows, 1-128 explicitly selected finite numeric
features, and 2-64 classification labels or a finite, varying regression target.
Categorical predictors and missing-value imputation need separate recipes. Feature
order is recorded and must match inference input. Classification inference returns
the original labels. Use `--task regression` for both numeric regression recipes.

The default random split stratifies classification components. Numeric-equivalent
feature duplicates stay together, including rows with different IDs or targets.
Exact target copies are rejected. `--split-strategy group --group-column subject`
keeps subjects and transitive duplicate links together. Fractions target 60/20/20
of independent components; actual row counts can differ and are recorded.
`--split-strategy time --time-column timestamp` sorts numeric or timezone-aware
ISO times, keeps ties together, and requires strictly ordered partitions. Duplicate
features or declared subjects crossing time boundaries cause an explicit failure.
No rows are silently discarded. Group/time columns and `id` cannot be features.

Profiles report training-only feature statistics, duplicate counts and conflicting
targets. Content-addressed split evidence includes every row position, strategy,
seed, class mapping, source/licence manifest hash and integrity checks. Hashes of
split/profile documents use canonical JSON; the dataset and manifest hashes use
their exact bytes. These guards cover exact duplicates and exact target copies;
semantic leakage, overlapping time windows, approximate duplicates and deployment
shifts still require task-specific review and independent evaluation.

Reproduce the fixed public-data validation cohort in a new workspace:

```sh
uv run --project lab python lab/scripts/validate-public-data.py \
  --workspace .lab/public-example --receipt .lab/public-example-receipt.json
```

This downloads the [UCI Iris](https://archive.ics.uci.edu/dataset/53/iris) archive's
`bezdekIris.data` and [UCI Wine Quality](https://archive.ics.uci.edu/dataset/186/wine+quality)
white-wine CSV. Both sources declare CC BY 4.0. Manifests retain the creator
citations, licence references, archive/member/converted hashes and exact conversion
steps. ML and DL each run seeds 7, 19 and 43, fixed split seed 2718 and 30 DL epochs.
No test results tune parameters. Public receipts report all 12 trials; data and
weights stay local. The two small tasks do not qualify production models.

Local datasets, checkpoints and the experiment database live in `.lab/`, which is
ignored by Git. Every valid training attempt is registered before training starts.
Failures remain visible. Database constraints prevent changing or deleting run
records or replacing their final state. Workers hold a POSIX file lease throughout
training. Recovery checks the original file identity and refuses a live, missing,
replaced or unverifiable legacy lease. This local path supports macOS/Linux disks;
Windows and remote filesystem leases need separate validation.

```sh
uv run --project lab canlilabs --workspace .lab model-card <run-id>
uv run --project lab canlilabs --workspace .lab compare <run-id> <run-id>
uv run --project lab canlilabs --workspace .lab recover <unfinished-run-id> \
  --reason "Worker was terminated during training"
uv run --project lab canlilabs --workspace .lab repair-receipts <run-id>
```

Comparisons require the same dataset, task and split protocol, include selected
failures and workspace trial counts, and choose no automatic test-based winner.
Recovery appends one failure event; it does not resume training. SQLite is the
authoritative ledger. Atomic JSON receipts are derived copies: a receipt I/O
failure cannot replace a committed success, and missing receipts can be rebuilt.
Existing altered receipts are reported instead of overwritten. Model cards are
registered artifacts whose hashes are checked before inspection. Evaluation-based
promotion, rollback, checkpoint resume and production serving remain upcoming work.

Inference loads only registered artifacts with matching hashes:

```sh
uv run --project lab canlilabs --workspace .lab predict <ml-or-dl-run-id> \
  --rows '[[0,0,0,0,0,0,0,0,0,0,0,0]]'
uv run --project lab canlilabs --workspace .lab predict <rl-run-id> --rows '[0,1,2]'
```

The local MCP pilot exposes three metadata tools: `lab_list_experiments`,
`lab_get_experiment`, and `lab_inspect_dataset`. Dataset inspection accepts an
optional `split_sha256` from a run, verifies its profile and source/licence hashes,
and returns metadata with no row positions. It uses SQLite read-only mode, bounded
queries and subprocess outputs. It cannot launch training, run inference, change
records or return dataset rows/model weights.

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
uv run --project lab ruff check lab/src lab/tests lab/scripts
uv run --project lab ruff format --check lab/src lab/tests lab/scripts
uv run --project lab pytest -q lab/tests
npm run test:lab-mcp
uv run --project lab python lab/scripts/prepare-evaluation.py --workspace .lab/frozen-pilot
node lab/scripts/verify-evaluation.mjs .lab/frozen-pilot
```

Tests train real multiclass/regression/RL models, reproduce seeds, verify held-out
improvement and reloads, check random/group/time leakage and provenance, interrupt
an actual worker process, retain failed trials, reject active/replaced leases and
tampered artifacts, and inspect real trained data through MCP without DB changes.
Public execution receipts live in `docs/goal/evidence/`; weights and datasets stay
local.
