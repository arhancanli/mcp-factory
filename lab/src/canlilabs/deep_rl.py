"""Bounded CPU DQN on versioned CartPole, with held-out policy evaluation."""

import copy
import hashlib
import inspect
import time

import gymnasium as gym
import numpy as np
import torch
from torch import nn

from .records import canonical, sha256_file, write_json


def network():
    return nn.Sequential(
        nn.Linear(4, 64), nn.ReLU(), nn.Linear(64, 64), nn.ReLU(), nn.Linear(64, 2)
    )


class ReplayBuffer:
    """A fixed-size ring retaining the actual final observation before reset."""

    def __init__(self, capacity, seed):
        self.capacity = capacity
        self.rng = np.random.default_rng(seed)
        self.states = np.zeros((capacity, 4), dtype=np.float32)
        self.next_states = np.zeros_like(self.states)
        self.actions = np.zeros(capacity, dtype=np.int64)
        self.rewards = np.zeros(capacity, dtype=np.float32)
        self.terminated = np.zeros(capacity, dtype=bool)
        self.truncated = np.zeros(capacity, dtype=bool)
        self.size = self.position = 0

    def push(self, state, action, reward, next_state, terminated, truncated):
        position = self.position
        self.states[position] = state
        self.next_states[position] = next_state
        self.actions[position] = action
        self.rewards[position] = reward
        self.terminated[position] = terminated
        self.truncated[position] = truncated
        self.position = (position + 1) % self.capacity
        self.size = min(self.size + 1, self.capacity)

    def sample(self, count):
        if not 1 <= count <= self.size:
            raise ValueError("Sample only available replay transitions.")
        indices = self.rng.choice(self.size, count, replace=False)
        return {
            name: torch.from_numpy(getattr(self, name)[indices])
            for name in ["states", "actions", "rewards", "next_states", "terminated", "truncated"]
        }


def bellman_targets(rewards, terminated, next_values, gamma):
    # External time limits end an episode, but are not absorbing terminal states.
    return rewards + gamma * (~terminated).to(rewards.dtype) * next_values


def optimize(policy, target, optimizer, batch, gamma):
    values = policy(batch["states"]).gather(1, batch["actions"].unsqueeze(1)).squeeze(1)
    with torch.no_grad():
        targets = bellman_targets(
            batch["rewards"], batch["terminated"], target(batch["next_states"]).max(1).values, gamma
        )
    loss = nn.functional.smooth_l1_loss(values, targets)
    if not torch.isfinite(loss):
        raise ValueError("DQN produced a non-finite training loss.")
    optimizer.zero_grad()
    loss.backward()
    nn.utils.clip_grad_norm_(policy.parameters(), 10.0, error_if_nonfinite=True)
    optimizer.step()
    return float(loss.detach())


def update_target(policy, target, tau):
    with torch.no_grad():
        for source, destination in zip(policy.parameters(), target.parameters(), strict=True):
            destination.lerp_(source, tau)


def check_deadline(deadline):
    if time.monotonic() > deadline:
        raise TimeoutError("The bounded DQN CPU trial exceeded its 300-second budget.")


def evaluate(policy, seed, episodes, *, random_policy=False, deadline=float("inf")):
    """Separate environment; explicit reset seeds and an independent action stream."""
    env = gym.make("CartPole-v1", max_episode_steps=500, sutton_barto_reward=False)
    rng = np.random.default_rng(seed + 1_000_000)
    returns, endings = [], []
    try:
        with torch.inference_mode():
            for episode in range(episodes):
                check_deadline(deadline)
                state, _ = env.reset(seed=seed + episode)
                total = 0.0
                for step in range(500):
                    if step % 64 == 0:
                        check_deadline(deadline)
                    action = (
                        int(rng.integers(2))
                        if random_policy
                        else int(policy(torch.from_numpy(state)).argmax())
                    )
                    state, reward, terminated, truncated, _ = env.step(action)
                    total += reward
                    if terminated or truncated:
                        break
                returns.append(total)
                endings.append({"terminated": bool(terminated), "truncated": bool(truncated)})
    finally:
        env.close()
    return {"reset_seed_start": seed, "returns": returns, "endings": endings}


def return_summary(values):
    return {
        "episodes": len(values),
        "mean_return": float(np.mean(values)),
        "std_return": float(np.std(values, ddof=1)),
        "minimum_return": float(np.min(values)),
        "maximum_return": float(np.max(values)),
    }


def load_policy(checkpoint):
    policy = network()
    policy.load_state_dict(torch.load(checkpoint, map_location="cpu", weights_only=True))
    policy.eval()
    return policy


def predict_actions(checkpoint, rows):
    observations = np.asarray(rows, dtype=np.float32)
    if observations.ndim != 2 or observations.shape[1] != 4 or not 1 <= len(observations) <= 100:
        raise ValueError("DQN prediction needs 1 to 100 observations with four numeric features.")
    if not np.isfinite(observations).all():
        raise ValueError("DQN observations must be finite float32 values.")
    policy = load_policy(checkpoint)
    with torch.inference_mode():
        values = policy(torch.from_numpy(observations))
        if not torch.isfinite(values).all():
            raise ValueError("DQN predictions exceed the finite model range.")
        return values.argmax(1).tolist()


def train_dqn(_workspace, directory, config):
    torch.set_num_threads(1)
    torch.manual_seed(config["seed"])
    torch.use_deterministic_algorithms(True)
    deadline = time.monotonic() + 300
    settings = {
        "steps": config["training_steps"],
        "replay_capacity": 10_000,
        "batch_size": 64,
        "learning_starts": 512,
        "train_every": 4,
        "learning_rate": 0.0005,
        "gamma": 0.99,
        "target_tau": 0.01,
        "epsilon_start": 1.0,
        "epsilon_end": 0.05,
        "epsilon_decay_steps": 12_000,
        "validation_episodes": 20,
        "cpu_threads": 1,
        "max_trial_seconds": 300,
    }
    policy = network()
    target = copy.deepcopy(policy)
    target.requires_grad_(False)
    optimizer = torch.optim.Adam(policy.parameters(), lr=settings["learning_rate"])
    replay = ReplayBuffer(settings["replay_capacity"], config["seed"] + 500_000)
    rng = np.random.default_rng(config["seed"])
    env = gym.make("CartPole-v1", max_episode_steps=500, sutton_barto_reward=False)
    training_returns, validation, losses = [], [], []
    episodes = updates = terminations = truncations = episode_steps = 0
    total = 0.0
    best_score, selected_step, best_state = -float("inf"), 0, None
    checkpoints = {max(1, settings["steps"] * fraction // 4) for fraction in [1, 2, 3, 4]}
    try:
        state, _ = env.reset(seed=config["seed"])
        for step in range(1, settings["steps"] + 1):
            if step % 64 == 0:
                check_deadline(deadline)
            epsilon = max(
                settings["epsilon_end"],
                settings["epsilon_start"]
                - (settings["epsilon_start"] - settings["epsilon_end"])
                * (step - 1)
                / settings["epsilon_decay_steps"],
            )
            with torch.inference_mode():
                action = (
                    int(rng.integers(2))
                    if rng.random() < epsilon
                    else int(policy(torch.from_numpy(state)).argmax())
                )
            next_state, reward, terminated, truncated, _ = env.step(action)
            replay.push(state, action, reward, next_state, terminated, truncated)
            total += reward
            episode_steps += 1
            state = next_state
            if step >= settings["learning_starts"] and step % settings["train_every"] == 0:
                loss = optimize(
                    policy,
                    target,
                    optimizer,
                    replay.sample(settings["batch_size"]),
                    settings["gamma"],
                )
                updates += 1
                if updates == 1 or updates % 100 == 0:
                    losses.append({"step": step, "update": updates, "loss": loss})
                update_target(policy, target, settings["target_tau"])
            if terminated or truncated:
                training_returns.append({"return": total, "steps": episode_steps})
                terminations += int(terminated)
                truncations += int(truncated)
                episodes += 1
                total, episode_steps = 0.0, 0
                state, _ = env.reset(seed=config["seed"] + episodes)
            if step in checkpoints:
                outcome = evaluate(
                    policy,
                    config["seed"] + 1_000_000,
                    settings["validation_episodes"],
                    deadline=deadline,
                )
                score = float(np.mean(outcome["returns"]))
                validation.append({"step": step, "mean_return": score, **outcome})
                # Ties retain the earlier checkpoint. The final test is never consulted.
                if score > best_score:
                    best_score, selected_step = score, step
                    best_state = copy.deepcopy(policy.state_dict())
    finally:
        env.close()
    policy.load_state_dict(best_state)
    policy.eval()
    checkpoint = directory / "q-network.pt"
    torch.save(policy.state_dict(), checkpoint)
    reloaded = load_policy(checkpoint)
    probes = torch.tensor([[0.0] * 4, [0.1, -0.2, 0.03, 0.4], [-0.1, 0.2, -0.03, -0.4]])
    with torch.inference_mode():
        if not torch.equal(policy(probes), reloaded(probes)):
            raise RuntimeError("Reloaded DQN policy differs from the selected checkpoint.")
    evaluation = evaluate(
        reloaded, config["seed"] + 2_000_000, config["evaluation_episodes"], deadline=deadline
    )
    baseline = evaluate(
        reloaded,
        config["seed"] + 2_000_000,
        config["evaluation_episodes"],
        random_policy=True,
        deadline=deadline,
    )
    differences = np.asarray(evaluation["returns"]) - np.asarray(baseline["returns"])
    bootstrap_rng = np.random.default_rng(config["seed"] + 4_000_000)
    bootstrap_means = np.mean(bootstrap_rng.choice(differences, (2000, len(differences))), axis=1)
    interval = np.quantile(bootstrap_means, [0.025, 0.975]).tolist()
    protocol = {
        "id": "CartPole-v1",
        "gymnasium": gym.__version__,
        "environment_source_sha256": sha256_file(inspect.getfile(type(env.unwrapped))),
        "environment_licence": "MIT",
        "transition_source": "generated by the pinned Gymnasium CartPole simulator",
        "max_episode_steps": 500,
        "sutton_barto_reward": False,
        "training_seed_start": config["seed"],
        "training_reset_count": episodes + 1,
        "validation_seed_start": config["seed"] + 1_000_000,
        "validation_episodes": settings["validation_episodes"],
        "evaluation_seed_start": config["seed"] + 2_000_000,
        "evaluation_episodes": config["evaluation_episodes"],
        "random_policy_action_seed": config["seed"] + 3_000_000,
    }
    write_json(directory / "evaluation-returns.json", {"policy": evaluation, "random": baseline})
    write_json(
        directory / "learning-curves.json",
        {
            "steps": settings["steps"],
            "training_episodes": training_returns,
            "partial_episode": {"return": total, "steps": episode_steps},
            "validation": validation,
            "loss_samples": losses,
            "selected_step": selected_step,
        },
    )
    return {
        "environment": protocol,
        "evaluation_protocol_sha256": hashlib.sha256(
            canonical(
                {
                    key: value
                    for key, value in protocol.items()
                    if not key.startswith(("training_", "validation_"))
                }
            ).encode()
        ).hexdigest(),
        "training": {
            **settings,
            "gradient_updates": updates,
            "completed_episodes": episodes,
            "terminated_episodes": terminations,
            "truncated_episodes": truncations,
            "replay_size": replay.size,
            "selected_step": selected_step,
            "validation_mean_return": best_score,
        },
        "metrics": {
            "evaluation": return_summary(evaluation["returns"]),
            "random_policy_baseline": return_summary(baseline["returns"]),
            "return_improvement": float(differences.mean()),
            "paired_return_improvement_95_bootstrap_interval": interval,
            "uncertainty_scope": (
                "Held-out reset episodes for one fixed trained policy; "
                "not training-seed uncertainty."
            ),
        },
        "model": {
            "kind": "dqn",
            "task": "reinforcement_learning",
            "checkpoint": "q-network.pt",
            "observations": 4,
            "actions": 2,
            "architecture": [4, 64, 64, 2],
            "reload_verified": True,
            "selection": (
                "Highest mean return on 20 fixed validation resets, earliest tie; "
                "final test untouched."
            ),
        },
    }
