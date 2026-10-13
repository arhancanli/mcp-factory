"""Real CPU training with independent evaluation and reloadable checkpoints."""

import copy
import math
import time

import numpy as np

from .data import prepare_smoke_dataset
from .lifecycle import make_model_card
from .records import Ledger, canonical, sha256_file, write_json
from .tabular import prepare_tabular, validate_options


def validate_config(config):
    if config["recipe"] not in {"ml", "dl", "rl"}:
        raise ValueError("Choose ml, dl or rl.")
    if type(config["seed"]) is not int or not 0 <= config["seed"] <= 2**31 - 1:
        raise ValueError("Seed must be an integer from 0 to 2^31-1.")
    for name, low, high in [
        ("epochs", 1, 500),
        ("episodes", 1, 5000),
        ("evaluation_episodes", 20, 2000),
    ]:
        value = config[name]
        if not isinstance(value, int) or isinstance(value, bool) or not low <= value <= high:
            raise ValueError(f"{name} must be an integer from {low} to {high}.")


def accuracy(y, predicted):
    return float(np.mean(np.asarray(y) == np.asarray(predicted)))


def classification_summary(labels, splits, predictions):
    from sklearn.metrics import balanced_accuracy_score, f1_score

    majority = int(np.bincount(labels[splits["train"]]).argmax())
    test_labels = labels[splits["test"]]
    return {
        "validation_accuracy": accuracy(labels[splits["validation"]], predictions["validation"]),
        "test_accuracy": accuracy(test_labels, predictions["test"]),
        "test_macro_f1": float(f1_score(test_labels, predictions["test"], average="macro")),
        "test_balanced_accuracy": float(balanced_accuracy_score(test_labels, predictions["test"])),
        "baseline_test_accuracy": accuracy(test_labels, np.full(len(test_labels), majority)),
        "baseline": "majority label selected only from training data",
        "test_examples": len(test_labels),
    }


def regression_summary(targets, splits, predictions):
    from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

    test_targets = targets[splits["test"]]
    baseline = np.full(len(test_targets), float(targets[splits["train"]].mean()))
    return {
        "validation_rmse": float(
            np.sqrt(mean_squared_error(targets[splits["validation"]], predictions["validation"]))
        ),
        "test_rmse": float(np.sqrt(mean_squared_error(test_targets, predictions["test"]))),
        "test_mae": float(mean_absolute_error(test_targets, predictions["test"])),
        "test_r2": float(r2_score(test_targets, predictions["test"]))
        if len(test_targets) > 1 and np.var(test_targets) > 0
        else None,
        "baseline_test_rmse": float(np.sqrt(mean_squared_error(test_targets, baseline))),
        "baseline": "mean target selected only from training data",
        "test_examples": len(test_targets),
    }


def training_data(workspace, config):
    if config.get("dataset_id"):
        return prepare_tabular(workspace, config)
    features, labels, splits, data = prepare_smoke_dataset(workspace)
    data.update(task="classification", feature_names=[f"x{i}" for i in range(12)], classes=[0, 1])
    return features, labels, splits, data


def train_ml(workspace, directory, config):
    from sklearn.linear_model import LogisticRegression, Ridge
    from sklearn.pipeline import make_pipeline
    from sklearn.preprocessing import StandardScaler

    features, labels, splits, data = training_data(workspace, config)
    regression = data["task"] == "regression"
    estimator = (
        Ridge(alpha=1.0)
        if regression
        else LogisticRegression(max_iter=500, random_state=config["seed"])
    )
    model = make_pipeline(StandardScaler(), estimator)
    model.fit(features[splits["train"]], labels[splits["train"]])
    predictions = {name: model.predict(features[indices]) for name, indices in splits.items()}
    scaler, fitted = model.steps[0][1], model.steps[1][1]
    checkpoint = directory / "model.npz"
    np.savez(
        checkpoint,
        mean=scaler.mean_,
        scale=scaler.scale_,
        coef=fitted.coef_,
        intercept=fitted.intercept_,
        classes=np.asarray([]) if regression else fitted.classes_,
        task=data["task"],
    )
    reloaded = predict_ml(checkpoint, features[splits["test"]])
    if not np.allclose(reloaded, predictions["test"], rtol=1e-12, atol=1e-12):
        raise RuntimeError("Reloaded ML predictions differ from the trained model.")
    return {
        "data": data,
        "metrics": (regression_summary if regression else classification_summary)(
            labels, splits, predictions
        ),
        "model": {
            "kind": "scaled_ridge_regression" if regression else "scaled_logistic_regression",
            "task": data["task"],
            "features": features.shape[1],
            "feature_names": data["feature_names"],
            "classes": data["classes"],
            "checkpoint": "model.npz",
            "reload_verified": True,
        },
    }


def predict_ml(checkpoint, features):
    with np.load(checkpoint, allow_pickle=False) as saved:
        standardized = (features - saved["mean"]) / saved["scale"]
        scores = standardized @ saved["coef"].T + saved["intercept"]
        if "task" in saved and saved["task"].item() == "regression":
            return scores
        positions = (
            (scores[:, 0] > 0).astype(int) if scores.shape[1] == 1 else scores.argmax(axis=1)
        )
        return saved["classes"][positions]


def build_mlp(inputs=12, outputs=2):
    import torch

    return torch.nn.Sequential(
        torch.nn.Linear(inputs, 32), torch.nn.ReLU(), torch.nn.Linear(32, outputs)
    )


def train_dl(workspace, directory, config):
    import torch

    torch.manual_seed(config["seed"])
    torch.set_num_threads(1)
    torch.use_deterministic_algorithms(True)
    features, labels, splits, data = training_data(workspace, config)
    regression = data["task"] == "regression"
    train_features = features[splits["train"]]
    mean, scale = train_features.mean(axis=0), train_features.std(axis=0)
    scale[scale == 0] = 1
    values = torch.tensor((features - mean) / scale, dtype=torch.float32)
    target_mean = float(labels[splits["train"]].mean()) if regression else 0.0
    target_scale = float(labels[splits["train"]].std()) if regression else 1.0
    targets = (
        torch.tensor((labels - target_mean) / target_scale, dtype=torch.float32).unsqueeze(1)
        if regression
        else torch.tensor(labels, dtype=torch.long)
    )
    if not torch.isfinite(values).all() or not torch.isfinite(targets).all():
        raise ValueError("Preprocessed values exceed the finite CPU tensor range.")
    train_indices = torch.tensor(splits["train"])
    validation_indices = torch.tensor(splits["validation"])
    outputs = 1 if regression else len(data["classes"])
    model = build_mlp(features.shape[1], outputs)
    optimizer = torch.optim.Adam(model.parameters(), lr=0.01)
    criterion = torch.nn.MSELoss() if regression else torch.nn.CrossEntropyLoss()
    generator = torch.Generator().manual_seed(config["seed"])
    curves, best_loss, best_checkpoint = [], math.inf, None
    for epoch in range(config["epochs"]):
        model.train()
        order = train_indices[torch.randperm(len(train_indices), generator=generator)]
        total_loss = 0.0
        for batch in order.split(64):
            optimizer.zero_grad(set_to_none=True)
            loss = criterion(model(values[batch]), targets[batch])
            if not torch.isfinite(loss):
                raise ValueError("Training loss is non-finite; the trial is retained as failed.")
            loss.backward()
            optimizer.step()
            total_loss += float(loss.detach()) * len(batch)
        model.eval()
        with torch.no_grad():
            validation_loss = float(
                criterion(model(values[validation_indices]), targets[validation_indices])
            )
        if not math.isfinite(validation_loss):
            raise ValueError("Validation loss is non-finite; the trial is retained as failed.")
        curves.append(
            {
                "epoch": epoch + 1,
                "train_loss": total_loss / len(train_indices),
                "validation_loss": validation_loss,
            }
        )
        if validation_loss < best_loss:
            best_loss = validation_loss
            best_checkpoint = {
                "model": copy.deepcopy(model.state_dict()),
                "optimizer": copy.deepcopy(optimizer.state_dict()),
                "epoch": epoch + 1,
                "validation_loss": validation_loss,
                "mean": torch.tensor(mean),
                "scale": torch.tensor(scale),
                "inputs": features.shape[1],
                "outputs": outputs,
                "task": data["task"],
                "target_mean": target_mean,
                "target_scale": target_scale,
            }
    model.load_state_dict(best_checkpoint["model"])
    model.eval()
    with torch.no_grad():
        predictions = {
            name: model(values[indices]).squeeze(1).numpy().astype(float) * target_scale
            + target_mean
            if regression
            else model(values[indices]).argmax(dim=1).numpy()
            for name, indices in splits.items()
        }
    checkpoint = directory / "model.pt"
    torch.save(best_checkpoint, checkpoint)
    reloaded = predict_dl(checkpoint, features[splits["test"]])
    if not np.allclose(reloaded, predictions["test"], rtol=1e-6, atol=1e-6):
        raise RuntimeError("Reloaded neural-network predictions differ from the trained model.")
    write_json(directory / "learning-curves.json", curves)
    return {
        "data": data,
        "metrics": (regression_summary if regression else classification_summary)(
            labels, splits, predictions
        ),
        "model": {
            "kind": "torch_mlp",
            "task": data["task"],
            "features": features.shape[1],
            "feature_names": data["feature_names"],
            "classes": data["classes"],
            "checkpoint": "model.pt",
            "selected_epoch": best_checkpoint["epoch"],
            "selection": "validation loss",
            "reload_verified": True,
            "device": "cpu",
            "deterministic_algorithms": True,
        },
    }


def predict_dl(checkpoint, features):
    import torch

    saved = torch.load(checkpoint, map_location="cpu", weights_only=True)
    model = build_mlp(saved.get("inputs", 12), saved.get("outputs", 2))
    model.load_state_dict(saved["model"])
    model.eval()
    values = torch.tensor(features, dtype=torch.float64)
    values = ((values - saved["mean"]) / saved["scale"]).to(torch.float32)
    with torch.no_grad():
        if saved.get("task") == "regression":
            return (
                model(values).squeeze(1).numpy().astype(float) * saved["target_scale"]
                + saved["target_mean"]
            )
        return model(values).argmax(dim=1).numpy()


def wilson_interval(successes, total):
    p, z = successes / total, 1.959963984540054
    denominator = 1 + z * z / total
    centre = (p + z * z / (2 * total)) / denominator
    half = z * math.sqrt(p * (1 - p) / total + z * z / (4 * total * total)) / denominator
    return [max(0.0, centre - half), min(1.0, centre + half)]


def evaluate_policy(env, table, seed, episodes, random_policy=False):
    rewards, lengths = [], []
    for episode in range(episodes):
        state, _ = env.reset(seed=seed + 100_000 + episode)
        rng = np.random.default_rng(seed + 200_000 + episode)
        total = 0.0
        for _step in range(64):
            action = (
                int(rng.integers(env.action_space.n))
                if random_policy
                else int(table[state].argmax())
            )
            state, reward, terminated, truncated, _ = env.step(action)
            total += reward
            if terminated or truncated:
                break
        rewards.append(total)
        lengths.append(_step + 1)
    return {
        "mean_return": float(np.mean(rewards)),
        "successes": int(sum(rewards)),
        "episodes": episodes,
        "mean_episode_steps": float(np.mean(lengths)),
        "success_rate_95_interval": wilson_interval(int(sum(rewards)), episodes),
    }


def train_rl(_workspace, directory, config):
    import gymnasium as gym

    env = gym.make("FrozenLake-v1", map_name="4x4", is_slippery=False, max_episode_steps=64)
    rng = np.random.default_rng(config["seed"])
    table = np.zeros((env.observation_space.n, env.action_space.n))
    returns = []
    try:
        for episode in range(config["episodes"]):
            state, _ = env.reset(seed=config["seed"] + episode)
            epsilon = max(0.05, 1.0 - episode / (0.8 * config["episodes"]))
            total = 0.0
            for _ in range(64):
                if rng.random() < epsilon:
                    action = int(rng.integers(env.action_space.n))
                else:
                    options = np.flatnonzero(table[state] == table[state].max())
                    action = int(rng.choice(options))
                next_state, reward, terminated, truncated, _ = env.step(action)
                # A time limit is not an absorbing terminal state; bootstrap on truncation.
                target = reward + (0.0 if terminated else 0.95 * table[next_state].max())
                table[state, action] += 0.4 * (target - table[state, action])
                state = next_state
                total += reward
                if terminated or truncated:
                    break
            returns.append(total)
        evaluation = evaluate_policy(env, table, config["seed"], config["evaluation_episodes"])
        baseline = evaluate_policy(env, table, config["seed"], config["evaluation_episodes"], True)
        checkpoint = directory / "q-table.npy"
        np.save(checkpoint, table, allow_pickle=False)
        reloaded = np.load(checkpoint, allow_pickle=False)
        if not np.array_equal(reloaded, table):
            raise RuntimeError("Reloaded Q-table differs from the trained policy.")
        write_json(
            directory / "learning-curves.json",
            {
                "episodes": len(returns),
                "total_training_successes": int(sum(returns)),
                "last_100_mean_return": float(np.mean(returns[-100:])),
            },
        )
        return {
            "environment": {
                "id": "FrozenLake-v1",
                "map": "4x4",
                "is_slippery": False,
                "max_episode_steps": 64,
                "evaluation_seed_offset": 100_000,
                "training_seed_count": config["episodes"],
            },
            "metrics": {
                "evaluation": evaluation,
                "random_policy_baseline": baseline,
                "return_improvement": evaluation["mean_return"] - baseline["mean_return"],
            },
            "model": {
                "kind": "q_learning",
                "checkpoint": "q-table.npy",
                "reload_verified": True,
                "states": int(env.observation_space.n),
                "actions": int(env.action_space.n),
            },
        }
    finally:
        env.close()


def train(
    workspace,
    recipe,
    *,
    seed=7,
    epochs=30,
    episodes=1500,
    evaluation_episodes=200,
    dataset_id=None,
    task="classification",
    features=None,
    split_strategy="random",
    split_seed=2718,
    group_column=None,
    time_column=None,
):
    config = {
        "recipe": recipe,
        "seed": seed,
        "epochs": epochs,
        "episodes": episodes,
        "evaluation_episodes": evaluation_episodes,
        "device": "cpu",
        "scope": "registered numeric CPU recipe" if dataset_id else "synthetic CPU smoke recipe",
    }
    validate_config(config)
    if dataset_id:
        if recipe == "rl":
            raise ValueError("Tabular datasets are for ml/dl; rl uses its versioned environment.")
        config.update(
            dataset_id=dataset_id,
            task=task,
            features=features,
            split_strategy=split_strategy,
            split_seed=split_seed,
            group_column=group_column,
            time_column=time_column,
        )
        validate_options(config)
    elif (
        features
        or task != "classification"
        or split_strategy != "random"
        or group_column
        or time_column
        or split_seed != 2718
    ):
        raise ValueError("Supply --dataset-id to train with dataset/task/split options.")
    ledger = Ledger(workspace)
    with ledger.active_run(config) as (run_id, directory):
        started = time.monotonic()
        try:
            result = {"ml": train_ml, "dl": train_dl, "rl": train_rl}[recipe](
                ledger.workspace,
                directory,
                config,
            )
            result["duration_seconds"] = time.monotonic() - started
            write_json(directory / "model-card.json", make_model_card(run_id, config, result))
            result["artifacts"] = {
                p.name: sha256_file(p)
                for p in directory.iterdir()
                if p.name not in {"started.json", ".worker.lock"} and p.is_file()
            }
            canonical(result)  # Reject non-finite metrics before completing the run.
        except BaseException as error:
            ledger.finish(
                run_id,
                "failed",
                {
                    "error_type": type(error).__name__,
                    "message": str(error),
                    "duration_seconds": time.monotonic() - started,
                },
            )
            raise
        ledger.finish(run_id, "succeeded", result)
    return ledger.get(run_id)


def predict(workspace, run_id, rows):
    ledger = Ledger(workspace)
    record = ledger.get(run_id)
    if record["state"] != "succeeded":
        raise ValueError("Choose a completed successful training run.")
    recipe = record["config"]["recipe"]
    filename = record["result"]["model"]["checkpoint"]
    checkpoint = ledger.artifact(run_id, filename)
    if recipe == "rl":
        states = np.asarray(rows)
        if states.ndim != 1 or not np.issubdtype(states.dtype, np.integer):
            raise ValueError("RL prediction needs a list of integer state IDs.")
        if len(states) > 100 or not ((states >= 0) & (states < 16)).all():
            raise ValueError("Use at most 100 FrozenLake state IDs from 0 to 15.")
        return {
            "run_id": run_id,
            "actions": np.load(checkpoint, allow_pickle=False)[states].argmax(axis=1).tolist(),
        }
    features = np.asarray(rows, dtype=float)
    count = record["result"]["model"]["features"]
    if features.ndim != 2 or features.shape[1] != count or not 1 <= len(features) <= 100:
        raise ValueError(f"Use 1 to 100 examples, each with exactly {count} numeric features.")
    if not np.isfinite(features).all():
        raise ValueError("Features must be finite numeric values.")
    predictions = {"ml": predict_ml, "dl": predict_dl}[recipe](checkpoint, features)
    if record["config"].get("dataset_id") and record["result"]["model"]["task"] == "classification":
        predictions = np.asarray(record["result"]["model"]["classes"])[predictions.astype(int)]
    if np.issubdtype(predictions.dtype, np.number) and not np.isfinite(predictions).all():
        raise ValueError("Predictions exceed the finite model range.")
    return {"run_id": run_id, "predictions": predictions.tolist()}
