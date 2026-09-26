// The calls the golden tests replay and scripts/perf.mjs times. test/record.mjs runs them against
// endoflife.date and stores the responses, compressed, in test/fixtures.
export const NOW = Date.parse("2026-09-26T12:00:00Z");

export const PROJECT = [
  { path: "Dockerfile", content: "FROM node:18-alpine3.17 AS build\nFROM python:3.8-slim-bullseye\n" },
  { path: ".nvmrc", content: "lts/hydrogen\n" },
  { path: ".github/workflows/ci.yml", content: "jobs:\n  test:\n    runs-on: ubuntu-20.04\n    strategy:\n      matrix:\n        node: [20, 22, 24]\n" },
  { path: "pyproject.toml", content: "[project]\nrequires-python = \">=3.10\"\n" },
  { path: "README.md", content: "hello" },
];

export const SCENARIOS = [
  { label: "check_project: Dockerfile, .nvmrc, a CI workflow, pyproject", tool: "check_project", args: { files: PROJECT }, example: true },
  { label: "check_versions: 6 named versions", tool: "check_versions", args: { items: ["python 3.8", "node@18", "postgres:13", "ubuntu 20.04", "django 4.2", "nonsense 1.0"] } },
  { label: "product_lifecycle: Node.js", tool: "product_lifecycle", args: { product: "node" } },
  { label: "check_project: no pinned versions", tool: "check_project", args: { files: [{ path: "README.md", content: "x" }] }, expectError: true },
];
