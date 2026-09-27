// src/worker.mjs
//
// One regex engine in its own worker thread (src/engines.mjs picks it through workerData), so a
// pattern that backtracks forever can be stopped by ending the thread. Every engine reports in the
// same shape; match positions are counted in characters (code points), since JavaScript, PCRE2 and
// RE2 count UTF-16 units and Python counts characters.
//   javascript  V8's own RegExp
//   python      CPython's re module, through Pyodide (CPython compiled to WebAssembly)
//   pcre        PCRE2 10.48 (WebAssembly), in UTF mode as PHP's /u uses it, default match limit
//   re2         Google's RE2 (WebAssembly): linear time, no backreferences or lookaround
import { createRequire } from "node:module";
import { parentPort, workerData } from "node:worker_threads";

const require = createRequire(import.meta.url);
const FLAVOR = workerData.flavor;
const MAX_COUNT = 10_000;

/** A UTF-16 index as a character (code point) index. */
const cp = (text, i) => {
  let n = 0;
  for (let k = 0; k < i && k < text.length; k++) {
    const c = text.charCodeAt(k);
    if (c < 0xd800 || c > 0xdbff || k + 1 >= text.length) n++;
  }
  return n;
};
const orNull = (v) => (v === undefined ? null : v);

// ---- JavaScript ----
function jsFlags(flags) {
  const bad = [...flags].filter((f) => !"imsu".includes(f));
  if (bad.length) throw Object.assign(new Error(`JavaScript regular expressions have no ${bad.join(", ")} flag${bad.includes("x") ? " (x, extended mode, does not exist in JavaScript)" : ""}`), { flagError: true });
  return `${flags}g`;
}
function javascript(job) {
  let re;
  try {
    re = new RegExp(job.pattern, jsFlags(job.flags));
  } catch (e) {
    return { error: { message: e.message.replace(/^Invalid regular expression: \/.*\/\w*: /s, "") } };
  }
  return {
    results: job.inputs.map((text) => {
      const matches = [];
      let count = 0;
      for (const m of text.matchAll(re)) {
        count++;
        if (matches.length < job.maxMatches) matches.push({ index: cp(text, m.index), text: m[0], groups: m.slice(1).map(orNull), ...(m.groups ? { named: Object.fromEntries(Object.entries(m.groups).map(([k, v]) => [k, orNull(v)])) } : {}) });
        if (count >= MAX_COUNT) break;
      }
      const out = { matches, match_count: count };
      if (job.replacement !== undefined) out.replaced = text.replace(re, job.replacement);
      return out;
    }),
  };
}

// ---- Python ----
let py;
const PY = `
import re, json
def run(pattern, flags, inputs, replacement, max_matches, max_count):
    f = 0
    for ch in flags:
        f |= {"i": re.I, "m": re.M, "s": re.S, "x": re.X, "a": re.A, "u": 0}.get(ch, 0)
    bad = [ch for ch in flags if ch not in "imsxau"]
    if bad:
        return json.dumps({"error": {"message": "Python's re has no " + ", ".join(bad) + " flag"}})
    try:
        rx = re.compile(pattern, f)
    except re.error as e:
        return json.dumps({"error": {"message": e.msg, "offset": e.pos}})
    results = []
    for text in inputs:
        ms, count = [], 0
        for m in rx.finditer(text):
            count += 1
            if len(ms) < max_matches:
                d = {"index": m.start(), "text": m.group(0), "groups": list(m.groups())}
                if m.groupdict():
                    d["named"] = m.groupdict()
                ms.append(d)
            if count >= max_count:
                break
        r = {"matches": ms, "match_count": count}
        if replacement is not None:
            try:
                r["replaced"] = rx.sub(replacement, text)
            except (re.error, IndexError) as e:
                r["replace_error"] = str(e)
        results.append(r)
    return json.dumps({"results": results})

def timed(pattern, flags, subject):
    f = 0
    for ch in flags:
        f |= {"i": re.I, "m": re.M, "s": re.S, "x": re.X, "a": re.A}.get(ch, 0)
    return re.compile(pattern, f).search(subject) is not None
`;
async function python(job) {
  if (!py) {
    const { loadPyodide } = await import("pyodide");
    py = await loadPyodide();
    py.runPython(PY);
  }
  const run = py.globals.get("run");
  try {
    // undefined, not null: Pyodide turns JavaScript null into jsnull, which is not None.
    return JSON.parse(run(job.pattern, job.flags, py.toPy(job.inputs), job.replacement ?? undefined, job.maxMatches, MAX_COUNT));
  } finally {
    run.destroy();
  }
}

// ---- PCRE2 ----
let pcre;
let pcreApi;
async function pcreCompile(job) {
  if (!pcre) {
    pcreApi = await import("pcre2-wasm");
    pcre = await pcreApi.createPCRE2();
  }
  const bad = [...job.flags].filter((f) => !"imsxu".includes(f));
  if (bad.length) return { error: { message: `PCRE2 has no ${bad.join(", ")} flag here (use inline options such as (?U))` } };
  try {
    return { re: pcre.compile(job.pattern, pcreApi.parseFlags(`${job.flags.replace("u", "")}u`)) };
  } catch (e) {
    return { error: { message: String(e.message).replace(/^PCRE2 compile error at offset \d+: /, ""), offset: e.offset } };
  }
}
async function pcre2(job) {
  const c = await pcreCompile(job);
  if (c.error) return c;
  const { re } = c;
  try {
    const groupsN = re.patternInfo().captureCount;
    return {
      results: job.inputs.map((text) => {
        const matches = [];
        let count = 0;
        let error;
        try {
          for (const m of re.matchAllIterator(text)) {
            count++;
            if (matches.length < job.maxMatches) {
              const groups = Array.from({ length: groupsN }, (_, i) => orNull(m.groups[i]));
              matches.push({ index: cp(text, m.index), text: m.match, groups, ...(m.namedGroups && Object.keys(m.namedGroups).length ? { named: m.namedGroups } : {}) });
            }
            if (count >= MAX_COUNT) break;
          }
        } catch (e) {
          error = String(e.message).replace(/^PCRE2 match error: /, "");
        }
        const out = { matches, match_count: count, ...(error ? { match_error: error } : {}) };
        if (job.replacement !== undefined && !error) {
          try {
            out.replaced = re.replaceAll(text, job.replacement);
          } catch (e) {
            out.replace_error = String(e.message);
          }
        }
        return out;
      }),
    };
  } finally {
    re.destroy();
  }
}

// ---- RE2 ----
let RE2;
function re2Compile(job, extra = "g") {
  RE2 ??= require("re2-wasm").RE2;
  const bad = [...job.flags].filter((f) => !"imsu".includes(f));
  if (bad.length) return { error: { message: `RE2 has no ${bad.join(", ")} flag${bad.includes("x") ? " (RE2 has no extended mode)" : ""}` } };
  try {
    return { re: new RE2(job.pattern, `${extra}u${job.flags.replace("u", "")}`) };
  } catch (e) {
    return { error: { message: String(e.message).replace(/^Invalid regular expression: \/.*\/\w*: /s, "") } };
  }
}
function re2(job) {
  const c = re2Compile(job);
  if (c.error) return c;
  const { re } = c;
  return {
    results: job.inputs.map((text) => {
      const matches = [];
      let count = 0;
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(text))) {
        count++;
        if (matches.length < job.maxMatches) matches.push({ index: cp(text, m.index), text: m[0], groups: m.slice(1).map(orNull), ...(m.groups && Object.keys(m.groups).length ? { named: Object.fromEntries(Object.entries(m.groups).map(([k, v]) => [k, orNull(v)])) } : {}) });
        if (m[0] === "") re.lastIndex++;
        if (count >= MAX_COUNT) break;
      }
      const out = { matches, match_count: count };
      if (job.replacement !== undefined) out.replaced = text.replace(re2Compile(job).re, job.replacement);
      return out;
    }),
  };
}

const ENGINES = { javascript, python, pcre: pcre2, re2 };

/** One search of `subject`, for timing a ReDoS attack string. */
async function timed(job) {
  const t0 = performance.now();
  let outcome = "finished";
  if (FLAVOR === "javascript") new RegExp(job.pattern, job.flags.replace(/[^imsu]/g, "")).test(job.subject);
  else if (FLAVOR === "python") {
    await python({ ...job, inputs: [], maxMatches: 0 });
    const t = py.globals.get("timed");
    try {
      t(job.pattern, job.flags, job.subject);
    } finally {
      t.destroy();
    }
  } else if (FLAVOR === "pcre") {
    const c = await pcreCompile(job);
    if (c.error) throw new Error(c.error.message);
    try {
      c.re.test(job.subject);
    } catch (e) {
      outcome = String(e.message).replace(/^PCRE2 match error: /, "");
    } finally {
      c.re.destroy();
    }
  } else {
    const c = re2Compile(job, "");
    if (c.error) throw new Error(c.error.message);
    c.re.test(job.subject);
  }
  return { ms: Math.round((performance.now() - t0) * 10) / 10, outcome };
}

/** ReDoS analysis (recheck), run in the JavaScript engine's thread so it cannot block the server. */
async function analyze(job) {
  const { check } = require("recheck");
  const r = await check(job.pattern, job.flags, { timeout: job.timeoutMs ?? 8000 });
  return {
    status: r.status,
    complexity: r.complexity,
    attack: r.attack ? { string: r.attack.string, expression: r.attack.pattern } : undefined,
    hotspot: (r.hotspot ?? []).map((h) => ({ start: h.start, end: h.end, temperature: h.temperature })),
    error: r.error ? String(r.error.kind ?? r.error.message ?? r.error) : undefined,
  };
}

/** The engine's name and version, for the report. */
async function version() {
  if (FLAVOR === "javascript") return `V8 ${process.versions.v8} (Node ${process.version})`;
  if (FLAVOR === "python") {
    await python({ pattern: "a", flags: "", inputs: [], maxMatches: 0 });
    return `CPython ${py.runPython("import sys; sys.version.split()[0]")} re (Pyodide)`;
  }
  if (FLAVOR === "pcre") return "PCRE2 10.48";
  return "RE2 (re2-wasm 1.0.2)";
}

parentPort.on("message", async (job) => {
  try {
    const result = job.op === "time" ? await timed(job) : job.op === "analyze" ? await analyze(job) : job.op === "version" ? await version() : await ENGINES[FLAVOR](job);
    parentPort.postMessage({ id: job.id, result });
  } catch (e) {
    parentPort.postMessage({ id: job.id, error: String(e?.message ?? e) });
  }
});
