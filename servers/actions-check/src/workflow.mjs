// src/workflow.mjs
//
// What a workflow file uses and risks, read line by line (the parts that matter are line-shaped in
// every real workflow): each `uses:` with its line, `runs-on:` labels (and the values of a matrix
// they refer to), deprecated workflow commands, and two injection patterns from GitHub's own
// security guidance: untrusted event text expanded into a shell script, and pull_request_target
// workflows that check out the pull request's code.

// Event fields an outside contributor controls (GitHub Security Lab's list).
const UNTRUSTED = /\$\{\{\s*(github\.event\.(issue\.(title|body)|pull_request\.(title|body|head\.ref|head\.label|head\.repo\.default_branch)|comment\.body|review\.body|review_comment\.body|pages\.[^}]*\.page_name|commits\.[^}]*\.(message|author\.(email|name))|head_commit\.(message|author\.(email|name))|workflow_run\.(head_branch|head_commit\.(message|author\.(email|name))|display_title)|discussion\.(title|body)|release\.(name|body))|github\.head_ref)\s*\}\}/;
const DEPRECATED_COMMANDS = [
  [/::set-output\b/, "::set-output", 'write to $GITHUB_OUTPUT instead: echo "name=value" >> "$GITHUB_OUTPUT"'],
  [/::save-state\b/, "::save-state", 'write to $GITHUB_STATE instead: echo "name=value" >> "$GITHUB_STATE"'],
  [/::set-env\b/, "::set-env", 'disabled by GitHub; write to $GITHUB_ENV instead: echo "NAME=value" >> "$GITHUB_ENV"'],
  [/::add-path\b/, "::add-path", 'disabled by GitHub; write to $GITHUB_PATH instead: echo "/some/path" >> "$GITHUB_PATH"'],
];
const CHECKOUT_PR_HEAD = /github\.event\.pull_request\.head\.(sha|ref)|github\.head_ref|refs\/pull\/.*\/(head|merge)/;

const indentOf = (line) => line.match(/^\s*/)[0].length;
const strip = (v) => v.replace(/\s+#.*$/, "").trim().replace(/^["']|["']$/g, "");

/**
 * @returns {{uses: {value, line}[], runsOn: {label, line}[], findings: {level, line, issue, fix}[], triggers: string[], hasPermissions: boolean}}
 */
export function scanWorkflow(text) {
  const lines = String(text).replace(/\r\n/g, "\n").split("\n");
  const uses = [];
  const runsOn = [];
  const findings = [];
  const matrix = new Map(); // key -> [values], from `key: [a, b]` or block lists
  const triggers = new Set();
  let hasPermissions = false;
  let inRun = null; // {indent} while inside a `run: |` block
  let checkoutAt = null; // line of the last actions/checkout, to pair with its `ref:`
  const pendingCheckout = []; // checkouts of the PR head, judged once the triggers are known

  lines.forEach((line, i) => {
    const n = i + 1;
    const indent = indentOf(line);
    if (inRun && line.trim() && indent <= inRun.indent) inRun = null;
    const runLine = line.match(/^\s*-?\s*run:\s*(.*)$/);
    if (runLine) {
      if (/^[|>][-+]?\s*$/.test(runLine[1].trim())) inRun = { indent: indent };
      else checkScript(runLine[1], n);
    } else if (inRun) checkScript(line, n);

    const u = line.match(/^\s*-?\s*uses:\s*(\S.*)$/);
    if (u) {
      const value = strip(u[1]);
      uses.push({ value, line: n });
      checkoutAt = /^actions\/checkout@/.test(value) ? n : null;
    }
    const ref = line.match(/^\s*ref:\s*(.+)$/);
    if (ref && checkoutAt && n - checkoutAt < 8 && CHECKOUT_PR_HEAD.test(ref[1])) pendingCheckout.push(n);

    const r = line.match(/^\s*runs-on:\s*(.+)$/);
    if (r) {
      const v = strip(r[1]);
      const list = v.startsWith("[") ? v.slice(1, -1).split(",").map(strip) : [v];
      for (const label of list) runsOn.push({ label, line: n });
    }
    const mx = line.match(/^\s*([\w-]+):\s*\[(.+)\]\s*$/);
    if (mx) matrix.set(mx[1], mx[2].split(",").map(strip));
    if (/^\s*permissions\s*:/.test(line)) hasPermissions = true;
    const on = line.match(/^on:\s*(.*)$/) ?? line.match(/^"?on"?:\s*(.*)$/);
    if (on) {
      const inline = on[1].replace(/[[\]]/g, "");
      for (const t of inline.split(",").map((x) => x.trim()).filter(Boolean)) triggers.add(t);
      for (let j = i + 1; j < lines.length && (indentOf(lines[j]) > 0 || !lines[j].trim()); j++) {
        const t = lines[j].match(/^\s{1,4}([\w_]+):/)?.[1] ?? lines[j].match(/^\s{1,4}-\s*([\w_]+)\s*$/)?.[1];
        if (t && indentOf(lines[j]) <= 4) triggers.add(t);
      }
    }
  });

  function checkScript(text, n) {
    const hit = text.match(UNTRUSTED);
    if (hit) findings.push({ level: "error", line: n, issue: `Script injection: ${hit[0]} is text an outside contributor controls, expanded into a shell script.`, fix: `Pass it through an environment variable: env: VALUE: ${hit[0]} and use "$VALUE" in the script.` });
    for (const [re, name, fix] of DEPRECATED_COMMANDS) if (re.test(text)) findings.push({ level: name === "::set-env" || name === "::add-path" ? "error" : "warning", line: n, issue: `Deprecated workflow command ${name}.`, fix });
  }

  // Expand `runs-on: ${{ matrix.os }}` to the matrix's values.
  const expanded = runsOn.flatMap((r) => {
    const m = r.label.match(/^\$\{\{\s*matrix\.([\w-]+)\s*\}\}$/);
    return m && matrix.has(m[1]) ? matrix.get(m[1]).map((label) => ({ label, line: r.line, via: `matrix.${m[1]}` })) : [r];
  });
  if (triggers.has("pull_request_target"))
    for (const n of pendingCheckout)
      findings.push({ level: "error", line: n, issue: "pull_request_target workflow checks out the pull request's code: it runs untrusted code with the repository's secrets and a write token.", fix: "Use pull_request for building contributed code, or keep the checkout of the base branch and never run the PR's code in this workflow." });
  return { uses, runsOn: expanded, findings, triggers: [...triggers], hasPermissions };
}
