"""CPU qualification checks the installed build, not just GPU availability."""

import importlib.metadata
import platform
from types import SimpleNamespace

import pytest
import torch

from canlilabs.compute import cpu_environment


def test_actual_locked_profile_is_cpu_and_records_python_and_lock_identity():
    profile = cpu_environment()
    assert profile["python"] == "3.12.13"
    assert profile["platform"] == platform.system()
    assert profile["dependencies"]["torch"].split("+")[0] == "2.14.1"
    assert profile["torch_cuda_built"] is False
    assert profile["gpu_packages"] == []
    assert len(profile["lock_sha256"]) == len(profile["python_pin_sha256"]) == 64


def test_cuda_build_is_rejected_even_when_no_gpu_is_available(monkeypatch):
    monkeypatch.setattr(torch.version, "cuda", "13.0")
    with pytest.raises(ValueError, match="CUDA build"):
        cpu_environment()


def test_an_unqualified_python_version_is_rejected(monkeypatch):
    monkeypatch.setattr(platform, "python_version", lambda: "3.13.0")
    with pytest.raises(ValueError, match="CPython 3.12.13"):
        cpu_environment()


def test_installed_dependency_versions_must_match_the_declared_pins(monkeypatch):
    version = importlib.metadata.version
    monkeypatch.setattr(
        importlib.metadata, "version", lambda name: "0.0.0" if name == "numpy" else version(name)
    )
    with pytest.raises(ValueError, match="pinned numpy"):
        cpu_environment()


def test_extra_gpu_libraries_are_rejected_even_with_a_cpu_torch_build(monkeypatch):
    packages = list(importlib.metadata.distributions())
    packages.append(SimpleNamespace(metadata={"Name": "nvidia_cuda_runtime_cu13"}))
    monkeypatch.setattr(importlib.metadata, "distributions", lambda: packages)
    with pytest.raises(ValueError, match="GPU runtime packages"):
        cpu_environment()
