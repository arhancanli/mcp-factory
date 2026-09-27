// The calls the golden tests make and scripts/perf.mjs times. Offline: the engines run in-process.
export const SCENARIOS = [
  { label: "test_regex: Python-style named groups and \\d across four engines", tool: "test_regex", args: { pattern: "(?P<year>\\d{4})-(\\d{2})", inputs: ["on 2026-09", "٢٠٢٦-٠٩ and 1999-12"], replacement: "\\2/\\1" }, example: true },
  { label: "test_regex: a lookbehind, which RE2 refuses", tool: "test_regex", args: { pattern: "(?<=\\$)\\d+(?:\\.\\d\\d)?", inputs: ["price: $12.50 and $3"] } },
  { label: "check_redos: nested repetition, measured on the engines", tool: "check_redos", args: { pattern: "^(a+)+$" } },
  { label: "check_redos: an email pattern that is safe", tool: "check_redos", args: { pattern: "^[\\w.+-]+@[\\w-]+\\.[\\w.]+$" } },
];
