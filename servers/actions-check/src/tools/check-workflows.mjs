import { z } from "zod";
import { compact, defineTool } from "../kit/index.mjs";
import { labelStatus, runnerLabels } from "../runners.mjs";
import { scanWorkflow } from "../workflow.mjs";
import { GITHUB_OWNED, READ_ONLY, resolveAll } from "./shared.mjs";

const LEVELS = ["error", "warning", "info"];
const MAX_FINDINGS = 60;

export const checkWorkflows = defineTool({
  name: "check_workflows",
  title: "Review GitHub Actions workflows",
  description: "Reviews up to 30 workflow files (path and content): outdated actions and the SHA to pin, actions on deprecated Node runtimes, runner labels GitHub no longer provides, deprecated commands (set-output), script injection and pull_request_target risks. Findings with file, line and fix.",
  input: { files: z.array(z.object({ path: z.string().max(300), content: z.string().max(200_000) })).min(1).max(30) },
  output: { counts: z.record(z.string(), z.number()), findings: z.array(z.looseObject({ level: z.string(), issue: z.string() })) },
  annotations: READ_ONLY,
  handler: async ({ files }, ctx) => {
    const scans = files.map((f) => ({ path: f.path, ...scanWorkflow(f.content) }));
    const findings = [];
    const add = (level, where, issue, fix, code) => findings.push(compact({ level, where, code, issue, fix }));
    // The flagged line's text goes with its number, so it can be found however lines are counted.
    const lineText = (s, n) => {
      const t = files.find((f) => f.path === s.path)?.content.split(/\r?\n/)[n - 1]?.trim();
      return t ? (t.length > 120 ? `${t.slice(0, 117)}...` : t) : undefined;
    };
    for (const s of scans) {
      for (const f of s.findings) findings.push(compact({ level: f.level, file: s.path, line: f.line, code: lineText(s, f.line), issue: f.issue, fix: f.fix }));
      if (!s.hasPermissions && s.uses.length) findings.push(compact({ level: "info", file: s.path, issue: "No permissions block: the job token gets the repository's default permissions, which may include write access.", fix: "Add permissions: contents: read at the top, and grant more per job only where needed." }));
    }
    const where = (value) => scans.flatMap((s) => s.uses.filter((u) => u.value === value).map((u) => `${s.path}:${u.line}`));
    const actions = await resolveAll(ctx, scans.flatMap((s) => s.uses.map((u) => u.value)));
    const unpinned = [];
    for (const a of actions) {
      if (a.skipped) continue;
      const at = where(a.uses).join(", ");
      if (a.error) {
        add("error", at, `${a.uses}: ${a.error}`);
        continue;
      }
      const pin = a.latest_sha ? `${a.action}@${a.latest_sha} # ${a.latest}` : undefined;
      if (a.kind === "missing") add("error", at, `${a.uses}: ${a.ref} is not a tag, branch or commit of ${a.action}; the step fails.`, pin && `Use ${pin}`);
      else if (a.kind === "branch") add("warning", at, `${a.uses} follows the branch ${a.ref}: it changes without notice.`, pin && `Pin a release: ${pin}`);
      if (a.node && a.node < 20) add("error", at, `${a.uses} runs on Node ${a.node}, which GitHub has deprecated for actions.`, a.latest && a.latest_node && a.latest_node > a.node ? `Update to ${a.latest} (runs on Node ${a.latest_node}): ${pin}` : "Replace the action or ask its maintainers to update it.");
      else if (a.node && a.latest_node && a.latest_node > a.node) add("warning", at, `${a.uses} runs on Node ${a.node}; its latest release ${a.latest} runs on Node ${a.latest_node}.`, `Update: ${pin}`);
      if (a.majors_behind > 0 && !(a.node && a.node < 20)) add("warning", at, `${a.uses} is ${a.majors_behind} major version${a.majors_behind > 1 ? "s" : ""} behind (latest ${a.latest}).`, `Read its release notes, then ${pin}`);
      if (a.kind !== "sha" && !GITHUB_OWNED.has(a.owner)) unpinned.push(a.uses);
    }
    if (unpinned.length) add("info", "", `${unpinned.length} third-party action${unpinned.length > 1 ? "s are" : " is"} referenced by tag, which its owner can move: ${unpinned.slice(0, 8).join(", ")}${unpinned.length > 8 ? ", ..." : ""}.`, "Pin to the commit SHA (action@<sha> # vX.Y.Z); action_versions gives the SHA of any tag.");
    const labels = await runnerLabels(ctx);
    const seen = new Set();
    for (const s of scans)
      for (const r of s.runsOn) {
        if (r.label.includes("${{") || seen.has(`${s.path}|${r.label}`)) continue;
        seen.add(`${s.path}|${r.label}`);
        const status = labelStatus(labels, r.label);
        if (status === "retired") findings.push(compact({ level: "error", file: s.path, line: r.line, issue: `runs-on ${r.label}${r.via ? ` (${r.via})` : ""}: GitHub no longer provides this runner; jobs wait and fail.`, fix: "Use ubuntu-latest, or a current version from GitHub's runner-images list." }));
        else if (status === "deprecated") findings.push(compact({ level: "warning", file: s.path, line: r.line, issue: `runs-on ${r.label}: deprecated; GitHub will remove it.`, fix: "Move to a current runner image." }));
      }
    findings.sort((a, b) => LEVELS.indexOf(a.level) - LEVELS.indexOf(b.level));
    const counts = Object.fromEntries(LEVELS.map((l) => [l, findings.filter((f) => f.level === l).length]).filter(([, n]) => n));
    return {
      ...compact({
        actions: actions.filter((a) => !a.skipped && !a.error).map((a) => `${a.uses} -> ${a.tag ?? a.kind}${a.latest && a.latest !== a.tag ? `, latest ${a.latest}` : ""}${a.runtime ? `, ${a.runtime}` : ""}`),
        note: findings.length > MAX_FINDINGS ? `${findings.length - MAX_FINDINGS} lower findings not shown.` : undefined,
      }),
      counts,
      findings: findings.slice(0, MAX_FINDINGS),
    };
  },
});
