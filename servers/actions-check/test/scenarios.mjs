// The calls the golden tests replay and scripts/perf.mjs times. test/record.mjs runs them live and
// stores the responses, compressed, in test/fixtures.
export const WORKFLOW = "name: CI\non:\n  pull_request_target:\n  push:\njobs:\n  build:\n    runs-on: ${{ matrix.os }}\n    strategy:\n      matrix:\n        os: [ubuntu-20.04, ubuntu-latest, macos-14]\n    steps:\n      - uses: actions/checkout@v3\n        with:\n          ref: ${{ github.event.pull_request.head.sha }}\n      - uses: actions/setup-node@v4.0.0\n      - uses: peaceiris/actions-gh-pages@v3\n      - uses: some-org/does-not-exist-xyz@v1\n      - run: echo \"Title: ${{ github.event.pull_request.title }}\"\n      - run: |\n          echo \"::set-output name=x::1\"\n          echo \"done\"\n";

export const CLEAN = `name: Test
on: push
permissions:
  contents: read
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
      - run: npm test
`;

export const SCENARIOS = [
  { label: "check_workflows: a workflow with 12 problems", tool: "check_workflows", args: { files: [{ path: ".github/workflows/ci.yml", content: WORKFLOW }] }, example: true },
  { label: "check_workflows: a clean, pinned workflow", tool: "check_workflows", args: { files: [{ path: ".github/workflows/test.yml", content: CLEAN }] } },
  { label: "action_versions: 3 actions, with and without refs", tool: "action_versions", args: { actions: ["actions/checkout", "actions/setup-node@v4.0.0", "actions/upload-artifact@v3"] } },
  { label: "runner_labels: 4 labels", tool: "runner_labels", args: { labels: ["ubuntu-latest", "macos-14", "ubuntu-20.04", "my-gpu-runner"] } },
];
