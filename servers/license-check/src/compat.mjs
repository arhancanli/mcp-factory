// src/compat.mjs
//
// Whether what you include fits your project's license. For open source projects the verdict is
// OSADL's, with its reason. For a closed (proprietary) project, which OSADL's matrix does not list,
// the component's copyleft class decides: none is fine, strong copyleft is not (if distributed),
// weak or file-level copyleft (LGPL, MPL) depends on how it is combined. Expressions: OR takes the
// best choice, AND needs every part, and a linking exception (Classpath, GCC runtime, LLVM) turns a
// "no" into "check".
export const PROPRIETARY = /^(proprietary|closed(?:[- ]source)?|commercial|private|unlicensed|all rights reserved)$/i;
const RANK = { yes: 3, check: 2, unknown: 1, no: 0 };
const LINKING_EXCEPTIONS = /classpath|gcc-exception|llvm-exception|autoconf|bison|libtool|font-exception|openjdk-assembly|universal-foss|linking/i;

// Licenses OSADL's matrix leaves out, by kind: content licenses (Creative Commons) and
// source-available ones that are not open source.
function fallback(id) {
  if (/^CC0-/.test(id)) return { kind: "permissive", verdict: "yes", reason: `${id} waives rights (public domain dedication).` };
  if (/^CC-BY-(?!.*(NC|ND|SA))/.test(id)) return { kind: "permissive", verdict: "yes", reason: `${id} is a permissive content license: give attribution. It is meant for data and documents, not code.` };
  if (/^CC-BY-.*NC/.test(id)) return { kind: "non-commercial", verdict: "no", reason: `${id} forbids commercial use; it is not an open source license.` };
  if (/^CC-BY-.*ND/.test(id)) return { kind: "no-derivatives", verdict: "no", reason: `${id} forbids modified versions.` };
  if (/^CC-BY-.*SA/.test(id)) return { kind: "share-alike", verdict: "check", reason: `${id} is share-alike: adaptations must carry the same license; it is meant for content, not code.` };
  if (/^(BUSL|SSPL|Elastic)-/.test(id)) return { kind: "source-available", verdict: "check", reason: `${id} is source-available, not open source: it restricts some uses (for example offering the software as a service or in production), so read its terms against your use.` };
  return null;
}

const fromOsadl = (v) => ({ Yes: "yes", Same: "yes", No: "no", "Check dependency": "check" })[v] ?? "unknown";

/** One license (with an optional exception) against the project. */
function single(data, project, node) {
  const cl = data.osadl.copyleft[node.license];
  if (!node.known) return { verdict: "unknown", reason: `"${node.license}" is not a license SPDX lists; check its terms by hand.` };
  let out;
  if (project.proprietary) {
    const fb = cl === undefined ? fallback(node.license) : null;
    if (fb) out = { verdict: fb.kind === "share-alike" ? "check" : fb.verdict, reason: fb.reason };
    else if (cl === "No") out = { verdict: "yes", reason: `${node.license} is a permissive license: keep its notices.` };
    else if (cl === "Yes") out = { verdict: "no", reason: `${node.license} is a strong copyleft license: distributing a work that includes it requires releasing that work under it.` };
    else if (cl === "Yes (restricted)" || cl === "Questionable") out = { verdict: "check", reason: `${node.license} has limited copyleft: fine as a separate library or file used as-is (dynamic linking, unmodified files); changes to it must be shared.` };
    else out = { verdict: "unknown", reason: `OSADL does not classify ${node.license}.` };
  } else {
    const pair = data.osadl.pairs.get(`${project.id}|${node.license}`);
    const fb = !pair && data.osadl.known.has(project.id) ? fallback(node.license) : null;
    if (fb) out = { verdict: fb.verdict, reason: `${fb.reason} (Not in OSADL's matrix; judged by the license's kind.)` };
    else if (!pair) out = { verdict: "unknown", reason: `OSADL's matrix does not cover ${data.osadl.known.has(project.id) ? node.license : project.id}.` };
    else out = { verdict: fromOsadl(pair.verdict), reason: pair.why && pair.why !== "n.a." ? pair.why : pair.verdict === "Same" ? "The same license." : undefined };
  }
  if (node.exception) {
    out.note = `${node.license} WITH ${node.exception}: the exception relaxes the license's conditions`;
    if (out.verdict === "no" && LINKING_EXCEPTIONS.test(node.exception)) {
      out.verdict = "check";
      out.note += "; it is a linking exception, so using the code unmodified as a library may be allowed";
    }
    out.note += ".";
  }
  return { ...out, copyleft: cl };
}

/** A whole expression: {verdict, reason, via?, parts?}. */
export function judge(data, project, tree) {
  if (tree.license) return single(data, project, tree);
  const parts = (tree.or ?? tree.and).map((t) => ({ expression: exprText(t), ...judge(data, project, t) }));
  if (tree.or) {
    const best = parts.reduce((a, b) => (RANK[b.verdict] > RANK[a.verdict] ? b : a));
    return { verdict: best.verdict, via: best.expression, reason: best.reason, note: `You may choose any of: ${parts.map((p) => `${p.expression} (${p.verdict})`).join(", ")}.` };
  }
  const worst = parts.reduce((a, b) => (RANK[b.verdict] < RANK[a.verdict] ? b : a));
  return { verdict: worst.verdict, reason: worst.reason, note: `All of: ${parts.map((p) => `${p.expression} (${p.verdict})`).join(", ")}.` };
}

const exprText = (t) => (t.license ? `${t.license}${t.exception ? ` WITH ${t.exception}` : ""}` : `(${(t.and ?? t.or).map(exprText).join(t.and ? " AND " : " OR ")})`);
