// The calls the golden tests replay and scripts/perf.mjs times. test/record.mjs runs them live and
// stores the responses, compressed, in test/fixtures.
export const SCENARIOS = [
  { label: "changes_between: express 4.21.2 to 5.0.0 (History.md)", tool: "changes_between", args: { ecosystem: "npm", package: "express", from: "4.21.2", to: "5.0.0" }, example: true },
  { label: "changes_between: requests 2.31.0 to 2.32.3 (HISTORY.md)", tool: "changes_between", args: { ecosystem: "pypi", package: "requests", from: "2.31.0", to: "2.32.3" } },
  { label: "changes_between: serde 1.0.150 to 1.0.200 (GitHub releases)", tool: "changes_between", args: { ecosystem: "cargo", package: "serde", from: "1.0.150", to: "1.0.200" } },
  { label: "search_changelog: express, req.param", tool: "search_changelog", args: { ecosystem: "npm", package: "express", text: "req.param(" } },
  { label: "release_notes: react 18.0.0", tool: "release_notes", args: { ecosystem: "npm", package: "react", version: "18.0.0", max_chars: 1500 } },
  { label: "search_changelog: react, useId", tool: "search_changelog", args: { ecosystem: "npm", package: "react", text: "useId" } },
  { label: "changes_between: a version that was never published", tool: "changes_between", args: { ecosystem: "npm", package: "@babel/core", from: "7.20.0" }, expectError: true },
];
