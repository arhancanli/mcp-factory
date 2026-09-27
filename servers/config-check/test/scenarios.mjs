// The calls the golden tests replay and scripts/perf.mjs times. test/record.mjs runs them live and
// stores the responses, compressed, in test/fixtures.
export const TSCONFIG = `{
  // JSON with comments, as tsconfig allows
  "compilerOptions": {
    "target": "es2099",
    "moduleResolution": "nodenext",
    "strictNullCheck": true,
    "outdir": "dist",
    "importsNotUsedAsValues": "remove",
  },
  "include": "src"
}
`;

export const WORKFLOW = `name: CI
on:
  push:
    branch: [main]
  pull_request:
jobs:
  test:
    runs_on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm test
        timeout: 10
  build:
    runs-on: ubuntu-latest
    needs: test
    steps:
      - name: Build
`;

export const COMPOSE = `services:
  web:
    image: nginx:latest
    port:
      - "80:80"
    depends_on:
      - db
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost"]
      interval: 30
  db:
    image: postgres:16
`;

export const PYPROJECT = `[build-system]
build-backend = "hatchling.build"

[project]
name = "demo"
version = "0.1.0"
requires-python = 3.11
dependencies = "requests>=2"

[tool.ruff]
line_length = 100
`;

export const CLEAN_WORKFLOW = `name: Test
on: push
jobs:
  test:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - run: npm test
`;

export const MANIFEST = `{ "name": "Shop", "short_name": "Shop", "start_url": "/", "display": "fullscreenn", "icons": [{ "src": "/i.png", "sizes": "192x192" }] }`;

export const SCENARIOS = [
  {
    label: "validate_config: tsconfig, a workflow, a compose file and pyproject.toml with typical mistakes",
    tool: "validate_config",
    args: {
      files: [
        { path: "tsconfig.json", content: TSCONFIG },
        { path: ".github/workflows/ci.yml", content: WORKFLOW },
        { path: "docker-compose.yml", content: COMPOSE },
        { path: "pyproject.toml", content: PYPROJECT },
      ],
    },
    example: true,
  },
  { label: "validate_config: a clean workflow, and a manifest.json three schemas claim", tool: "validate_config", args: { files: [{ path: ".github/workflows/test.yml", content: CLEAN_WORKFLOW }, { path: "public/manifest.json", content: MANIFEST }] } },
  { label: "validate_config: YAML that does not parse", tool: "validate_config", args: { files: [{ path: "compose.yaml", content: "services:\n  web:\n    image: nginx\n   ports: [80]\n" }] } },
  { label: "config_help: tsconfig's compilerOptions.moduleResolution", tool: "config_help", args: { schema: "tsconfig.json", setting: "compilerOptions.moduleResolution" } },
  { label: "config_help: search a workflow's settings for 'timeout'", tool: "config_help", args: { schema: ".github/workflows/ci.yml", search: "timeout" } },
  { label: "config_help: a misspelt setting", tool: "config_help", args: { schema: "docker-compose.yml", setting: "services.*.helthcheck" }, expectError: true },
  { label: "find_schema: a file path and words", tool: "find_schema", args: { query: ".github/dependabot.yml" } },
];
