"""Fail if the actual environment differs from the pinned CPU qualification profile."""

import json

from canlilabs.compute import cpu_environment

print(json.dumps(cpu_environment(), sort_keys=True))
