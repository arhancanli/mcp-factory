// src/check.mjs
//
// test_regex and check_redos: the engines' own answers (src/worker.mjs), side by side, and where
// they disagree.
import { FLAVORS, runJob } from "./engines.mjs";

const TIMED_OUT = (s) => `did not finish within ${s} s on these inputs: catastrophic backtracking? check_redos shows why`;

// ctx.runJob replaces the engines in unit tests.
const run = (ctx, job, opts) => (ctx.runJob ?? runJob)(ctx, job, opts);

async function version(ctx, flavor) {
  ctx.versions ??= {};
  ctx.versions[flavor] ??= run(ctx, { flavor, op: "version" }).catch(() => flavor);
  return ctx.versions[flavor];
}

const brief = (r) => JSON.stringify([r.match_count, r.matches.map((m) => [m.index, m.text, m.groups])]);
const say = (r) => (r.match_count === 0 ? "no match" : `${r.match_count} match${r.match_count === 1 ? "" : "es"} (${r.matches.slice(0, 3).map((m) => JSON.stringify(m.text)).join(", ")}${r.match_count > 3 ? ", ..." : ""})`);

/** Where the engines disagree: compiling, matching an input, or replacing in it. */
export function differences(reports, inputs) {
  const out = [];
  const compiled = reports.filter((r) => r.results);
  const refused = reports.filter((r) => r.error);
  if (compiled.length && refused.length) out.push(`compiles in ${compiled.map((r) => r.flavor).join(", ")}; refused by ${refused.map((r) => `${r.flavor} (${r.error.message})`).join(", ")}`);
  inputs.forEach((_, i) => {
    const groups = new Map();
    for (const r of compiled) {
      const k = brief(r.results[i]);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(r);
    }
    if (groups.size > 1) out.push(`input ${i + 1}: ${[...groups.values()].map((g) => `${g.map((r) => r.flavor).join(", ")}: ${say(g[0].results[i])}`).join("; ")}`);
    const repl = new Map();
    for (const r of compiled) if (r.results[i].replaced !== undefined) (repl.get(r.results[i].replaced) ?? repl.set(r.results[i].replaced, []).get(r.results[i].replaced)).push(r.flavor);
    if (repl.size > 1) out.push(`input ${i + 1} replaced: ${[...repl.entries()].map(([v, f]) => `${f.join(", ")}: ${JSON.stringify(v)}`).join("; ")}`);
  });
  return out;
}

export async function testRegex(ctx, { pattern, flags = "", inputs, flavors = FLAVORS, replacement, max_matches: maxMatches = 20 }) {
  const reports = await Promise.all(
    [...new Set(flavors)].map(async (flavor) => {
      const engine = await version(ctx, flavor);
      try {
        const r = await run(ctx, { flavor, op: "test", pattern, flags, inputs, replacement, maxMatches });
        return { flavor, engine, ...r };
      } catch (e) {
        if (e.code === "timeout") return { flavor, engine, timed_out: TIMED_OUT(e.details.timeoutMs / 1000) };
        // One engine failing must not hide the others' answers.
        return { flavor, engine, failed: String(e.message).slice(0, 300) };
      }
    }),
  );
  const diffs = differences(reports, inputs);
  return { engines: reports, ...(reports.length > 1 ? { agree: diffs.length === 0 && reports.every((r) => r.results) } : {}), ...(diffs.length ? { differences: diffs } : {}) };
}

// Python-only group syntax, read the JavaScript way for the analysis (the backtracking is the same).
const forAnalysis = (p) => p.replace(/\(\?P<(\w+)>/g, "(?<$1>").replace(/\(\?P=(\w+)\)/g, "\\k<$1>");
const clip = (s, n) => (s.length > n ? `${s.slice(0, n)}... (${s.length} characters)` : s);

// The answer depends only on the pattern and flags; timing the attack costs seconds, so answers
// are kept (at most 200).
export async function checkRedos(ctx, args) {
  ctx.redos ??= new Map();
  const key = JSON.stringify([args.pattern, args.flags ?? "", args.verify ?? true]);
  if (!ctx.redos.has(key)) {
    const p = analyse(ctx, args);
    ctx.redos.set(key, p);
    p.catch(() => ctx.redos.delete(key));
    while (ctx.redos.size > 200) ctx.redos.delete(ctx.redos.keys().next().value);
  }
  return ctx.redos.get(key);
}

async function analyse(ctx, { pattern, flags = "", verify = true }) {
  if (flags.includes("x")) return { status: "unknown", note: "patterns in extended (x) mode are not analysed; remove the whitespace and comments first" };
  const a = await run(ctx, { flavor: "javascript", op: "analyze", pattern: forAnalysis(pattern), flags: flags.replace(/[^imsu]/g, "") }, { timeoutMs: 15_000 });
  if (a.status === "unknown" || a.error) return { status: "unknown", note: `the analysis did not finish: ${a.error ?? "unknown"}` };
  const out = { status: a.status, complexity: a.complexity?.summary };
  if (a.status !== "vulnerable") {
    out.note = "no input makes a backtracking engine take more than linear time on this pattern";
    return out;
  }
  // The pattern with the parts to blame marked, so they are read in place.
  const spans = a.hotspot.filter((h) => h.end > h.start).sort((x, y) => y.start - x.start);
  let marked = forAnalysis(pattern);
  for (const h of spans) marked = `${marked.slice(0, h.start)}\u00ab${marked.slice(h.start, h.end)}\u00bb${marked.slice(h.end)}`;
  out.hotspot = marked;
  out.attack = { expression: a.attack.expression, length: a.attack.string.length, sample: clip(a.attack.string, 80) };
  out.affected = "backtracking engines can be (JavaScript, Python, PCRE2/PHP, Java, .NET, Ruby); RE2, Go and Rust's regex run in linear time and cannot. PCRE2's optimisations defuse some patterns: measured_on_attack shows what each engine did here";
  out.fix = a.complexity?.type === "exponential" ? "remove the nested or overlapping repetition the hotspot shows (for example (a+)+ becomes a+), make alternatives mutually exclusive, or use an atomic group or possessive quantifier where the engine has them" : "bound the repetition the hotspot shows, anchor the pattern, or split the work so the same characters cannot be tried at every start position";
  if (verify) {
    const measured = await Promise.all(
      FLAVORS.map(async (flavor) => {
        try {
          const r = await run(ctx, { flavor, op: "time", pattern, flags, subject: a.attack.string }, { timeoutMs: 2000 });
          return { flavor, result: r.outcome === "finished" ? `${r.ms} ms` : `${r.outcome} after ${r.ms} ms (PCRE2 stops runaway matches itself)` };
        } catch (e) {
          if (e.code === "timeout") return { flavor, result: "stopped after 2 s without finishing" };
          return { flavor, result: `not run: ${String(e.message).replace(/^The \w+ engine failed: /, "")}` };
        }
      }),
    );
    out.measured_on_attack = measured;
    const hung = measured.filter((m) => /^stopped/.test(m.result)).map((m) => m.flavor);
    if (hung.length) out.hangs_on = hung;
  }
  return out;
}
