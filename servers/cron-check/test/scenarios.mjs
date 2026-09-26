// The calls the golden tests make and scripts/perf.mjs times. The server is offline (cron arithmetic
// and Node's time zone database), so the tests run the real code at a fixed moment.
export const NOW = Date.parse("2026-09-26T12:00:00Z");

export const EXPRESSIONS = ["0 9 * * 1-5", "*/7 * * * *", "0 0 1 * 1", "0 0 30 2 *", "cron(0 12 ? * MON-FRI *)", "0 0/5 14 * * ?", "0 10 ? * 6#3", "@daily", "61 * * * *", "0 0 L * *"];

export const SCENARIOS = [
  { label: "explain_cron: 10 expressions across dialects", tool: "explain_cron", args: { expressions: EXPRESSIONS }, example: true },
  { label: "next_runs: 02:30 daily in New York across the spring-forward change", tool: "next_runs", args: { expression: "30 2 * * *", timezone: "America/New_York", count: 3, from: "2026-03-07T00:00:00Z" } },
  { label: "convert_cron: weekdays at 09:00 to AWS EventBridge", tool: "convert_cron", args: { expression: "0 9 * * 1-5", to: "aws" } },
  { label: "convert_cron: day 1 OR Monday to AWS (needs two schedules)", tool: "convert_cron", args: { expression: "0 0 1 * 1", to: "aws" }, expectError: true },
];
