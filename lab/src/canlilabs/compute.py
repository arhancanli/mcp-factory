"""Inspect the actual installed CPU profile before platform qualification runs."""

import importlib.metadata
import platform
import sys
import tomllib
from pathlib import Path

from .records import environment, sha256_file


def cpu_environment():
    import torch

    root = Path(__file__).resolve().parents[2]
    python_pin = (root / ".python-version").read_text().strip()
    if sys.implementation.name != "cpython" or platform.python_version() != python_pin:
        raise ValueError(f"The validated CPU profile requires CPython {python_pin}.")
    if platform.system() not in {"Darwin", "Linux"}:
        raise ValueError("This local CPU profile is qualified on macOS and Linux only.")
    current = environment()
    project = tomllib.loads((root / "pyproject.toml").read_text())
    lock = tomllib.loads((root / "uv.lock").read_text())
    torch_index = (
        "https://download.pytorch.org/whl/cpu"
        if platform.system() == "Linux"
        else "https://pypi.org/simple"
    )
    torch_version = next(
        package["version"]
        for package in lock["package"]
        if package["name"] == "torch" and package["source"].get("registry") == torch_index
    )
    for requirement in project["project"]["dependencies"]:
        name, expected = requirement.split("==")
        if name == "torch":
            expected = torch_version
        installed = current["dependencies"][name]
        if installed != expected:
            raise ValueError(f"The CPU profile requires the pinned {name} version {expected}.")
    packages = sorted(
        distribution.metadata["Name"].lower().replace("_", "-")
        for distribution in importlib.metadata.distributions()
        if distribution.metadata.get("Name")
    )
    gpu_packages = [
        name
        for name in packages
        if name.startswith(("nvidia-", "cuda-", "pytorch-triton")) or name == "triton"
    ]
    if torch.version.cuda is not None or torch.backends.cuda.is_built() or gpu_packages:
        raise ValueError("The CPU profile contains a CUDA build or GPU runtime packages.")
    if torch.empty(1).device.type != "cpu":
        raise ValueError("The CPU profile has a non-CPU default tensor device.")
    return {
        "schema": "canlilabs.cpu-environment.v1",
        **current,
        "device": "cpu",
        "torch_cuda_version": torch.version.cuda,
        "torch_cuda_built": torch.backends.cuda.is_built(),
        "gpu_packages": gpu_packages,
        "installed_packages": packages,
        "lock_sha256": sha256_file(root / "uv.lock"),
        "python_pin_sha256": sha256_file(root / ".python-version"),
    }
