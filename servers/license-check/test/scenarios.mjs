// The calls the golden tests replay and scripts/perf.mjs times. test/record.mjs runs them live and
// stores the responses, compressed, in test/fixtures.
export const SCENARIOS = [
  { label: "check_compatibility: 6 licenses in a GPL-2.0-only project", tool: "check_compatibility", args: { project: "GPL-2.0-only", licenses: ["Apache-2.0", "MIT", "MIT OR GPL-3.0-only", "GPL-2.0-only WITH Classpath-exception-2.0", "LGPL-2.1-or-later", "Foo License"] }, example: true },
  { label: "check_compatibility: a proprietary project, copyleft and content licenses", tool: "check_compatibility", args: { project: "proprietary", licenses: ["MIT", "GPL-3.0-only", "LGPL-2.1-only", "MPL-2.0", "AGPL-3.0-only", "CC-BY-4.0", "SSPL-1.0"] } },
  { label: "license_info: 6 licenses written informally", tool: "license_info", args: { licenses: ["Apache License 2.0", "GPLv3", "New BSD", "GPL-2.0+", "MIT OR Apache-2.0", "SSPL"] } },
  { label: "package_licenses: 4 packages against MIT", tool: "package_licenses", args: { packages: [{ ecosystem: "npm", name: "caniuse-lite", version: "1.0.30001812" }, { ecosystem: "npm", name: "react", version: "19.3.0" }, { ecosystem: "pypi", name: "PyQt5", version: "5.15.11" }, { ecosystem: "npm", name: "sharp", version: "0.35.4" }], project: "MIT" } },
  { label: "check_compatibility: a project license that does not exist", tool: "check_compatibility", args: { project: "Totally Made Up License", licenses: ["MIT"] }, expectError: true },
];
