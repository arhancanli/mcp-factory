"""DQN behavioral checks: episode boundaries, replay, selection and real reload."""

import json

import numpy as np
import pytest
import torch

from canlilabs import deep_rl
from canlilabs.cli import main
from canlilabs.reader import list_experiments
from canlilabs.recipes import predict, train
from canlilabs.records import Ledger


def test_time_limit_transition_bootstraps_but_absorbing_terminal_does_not():
    replay = deep_rl.ReplayBuffer(4, 7)
    replay.push(np.zeros(4), 0, 1.0, np.ones(4), True, False)
    replay.push(np.zeros(4), 1, 1.0, np.ones(4), False, True)
    batch = replay.sample(2)
    targets = deep_rl.bellman_targets(
        batch["rewards"], batch["terminated"], torch.full((2,), 10.0), 0.9
    )
    assert targets[batch["terminated"]].tolist() == [1.0]
    assert targets[batch["truncated"]].tolist() == [10.0]
    assert torch.equal(batch["next_states"], torch.ones((2, 4)))


def test_replay_keeps_final_observation_and_remains_bounded_with_seeded_sampling():
    first = deep_rl.ReplayBuffer(3, 19)
    second = deep_rl.ReplayBuffer(3, 19)
    for value in range(6):
        state = np.full(4, value, dtype=np.float32)
        final = state + 1
        for replay in [first, second]:
            replay.push(state, value % 2, 1.0, final, False, True)
        state[:] = 1000  # Resetting/reusing the caller's arrays must not alter stored transitions.
        final[:] = 2000
    batch = first.sample(3)
    assert first.size == 3 and set(batch["states"][:, 0].tolist()) == {3, 4, 5}
    assert torch.equal(batch["next_states"], batch["states"] + 1)
    second_batch = second.sample(3)
    assert all(torch.equal(value, second_batch[name]) for name, value in batch.items())
    with pytest.raises(ValueError, match="available"):
        first.sample(4)


def test_optimizer_changes_online_network_only_then_target_moves():
    torch.manual_seed(7)
    policy, target = deep_rl.network(), deep_rl.network()
    target.load_state_dict(policy.state_dict())
    target.requires_grad_(False)
    before = {name: value.clone() for name, value in target.state_dict().items()}
    replay = deep_rl.ReplayBuffer(64, 7)
    for _ in range(64):
        replay.push(np.zeros(4), 0, 1.0, np.ones(4), False, False)
    optimizer = torch.optim.Adam(policy.parameters(), lr=0.001)
    loss = deep_rl.optimize(policy, target, optimizer, replay.sample(64), 0.99)
    assert np.isfinite(loss) and loss > 0
    assert all(torch.equal(value, before[name]) for name, value in target.state_dict().items())
    assert any(not torch.equal(value, before[name]) for name, value in policy.state_dict().items())
    assert all(parameter.grad is None for parameter in target.parameters())
    deep_rl.update_target(policy, target, 0.1)
    assert any(not torch.equal(value, before[name]) for name, value in target.state_dict().items())


def test_checkpoint_selection_uses_validation_and_earliest_tie_not_final_test(
    tmp_path, monkeypatch
):
    calls = []
    validation_scores = iter([200, 300, 300, 100])

    def evaluated(_policy, seed, episodes, *, random_policy=False, **_options):
        calls.append((seed, random_policy))
        score = next(validation_scores) if seed == 1_000_007 else 10
        return {
            "reset_seed_start": seed,
            "returns": [score] * episodes,
            "endings": [{"terminated": True, "truncated": False}] * episodes,
        }

    monkeypatch.setattr(deep_rl, "evaluate", evaluated)
    run = train(tmp_path, "dqn", training_steps=1024, evaluation_episodes=20)
    assert run["result"]["training"]["selected_step"] == 512
    assert run["result"]["training"]["validation_mean_return"] == 300
    assert calls == [(1_000_007, False)] * 4 + [(2_000_007, False), (2_000_007, True)]


def test_real_dqn_seed_repeat_reload_inference_and_trial_metadata(tmp_path):
    first = train(tmp_path, "dqn", seed=19, training_steps=1024, evaluation_episodes=20)
    second = train(tmp_path, "dqn", seed=19, training_steps=1024, evaluation_episodes=20)
    result = first["result"]
    assert result["metrics"] == second["result"]["metrics"]
    assert result["training"]["gradient_updates"] == 129
    assert result["model"]["reload_verified"] is True
    assert list_experiments(tmp_path, recipe="dqn")["total_count"] == 2
    ledger = Ledger(tmp_path)
    curves = json.loads(ledger.artifact(first["run_id"], "learning-curves.json").read_text())
    assert (
        sum(episode["steps"] for episode in curves["training_episodes"])
        + curves["partial_episode"]["steps"]
        == 1024
    )
    raw = json.loads(ledger.artifact(first["run_id"], "evaluation-returns.json").read_text())
    assert raw["policy"]["reset_seed_start"] == raw["random"]["reset_seed_start"] == 2_000_019
    assert len(raw["policy"]["returns"]) == len(raw["random"]["returns"]) == 20
    assert predict(tmp_path, first["run_id"], [[0.0] * 4])["actions"][0] in [0, 1]
    with pytest.raises(ValueError, match="four"):
        predict(tmp_path, first["run_id"], [[0.0] * 3])
    with pytest.raises(ValueError, match="finite"):
        predict(tmp_path, first["run_id"], [[float("nan")] * 4])
    checkpoint = ledger.artifact(first["run_id"], "q-network.pt")
    with checkpoint.open("ab") as stream:
        stream.write(b"modified")
    with pytest.raises(ValueError, match="hash mismatch"):
        predict(tmp_path, first["run_id"], [[0.0] * 4])


def test_dqn_deadline_failure_is_an_immutable_failed_trial(tmp_path, monkeypatch):
    def expired(_deadline):
        raise TimeoutError("bounded deadline fixture")

    monkeypatch.setattr(deep_rl, "check_deadline", expired)
    with pytest.raises(TimeoutError, match="bounded"):
        train(tmp_path, "dqn", training_steps=1024, evaluation_episodes=20)
    listing = Ledger(tmp_path).list()
    assert listing["total_count"] == 1 and listing["items"][0]["state"] == "failed"


def test_cli_step_bounds_fail_before_creating_a_trial(tmp_path, capsys):
    assert main(["--workspace", str(tmp_path), "train", "dqn", "--training-steps", "100001"]) == 1
    assert "training_steps" in json.loads(capsys.readouterr().err)["message"]
    assert Ledger(tmp_path).list()["total_count"] == 0
