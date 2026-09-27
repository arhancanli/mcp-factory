// src/check.mjs
//
// check_manifests: every object in the files, against the target version.
// 1. Its apiVersion: served (and whether deprecated), removed (with the replacement, and what else
//    in the object must change to pass under the replacement), or a kind the version does not have.
// 2. Its fields, against the version's schema (built-in kinds) or the custom resource's schema.
// 3. What the API server checks beyond the schema, Pod Security, and risks (src/rules.mjs).
// 4. Checks across objects: duplicates, Services and Ingresses that point at nothing.
import { mapLimit } from "./kit/index.mjs";
import { describeError, displayPath, findWarnings, nearest, simplify } from "./explain.mjs";
import { parseManifests } from "./parse.mjs";
import { crossChecks, objectChecks, podSecurity, quantityHint, WORKLOAD_POD } from "./rules.mjs";
import { compiledVersion, QUANTITY } from "./schema.mjs";
import { customResourceTree, definedHere, deprecations, INSTEAD } from "./sources.mjs";
import { resolveVersion, splitApiVersion, versionRank } from "./versions.mjs";

const ORDER = { error: 0, warning: 1, info: 2 };
const MAX_FINDINGS = 200;

// The API server reads a null field as unset ("annotations:" with nothing after it is fine), so
// nulls are removed before schema validation; a required field left null is then reported missing,
// as the server reports it.
export function withoutNulls(v) {
  if (Array.isArray(v)) return v.map(withoutNulls);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).filter(([, x]) => x !== null).map(([k, x]) => [k, withoutNulls(x)]));
  return v;
}

function schemaErrors(tree, obj, lineOf) {
  obj = withoutNulls(obj);
  if (tree.validate(obj)) return [];
  return simplify(tree, (tree.validate.errors ?? []).slice(0, 500)).map((e) => {
    const r = describeError(tree, e, { lineOf, format: "yaml" }).report;
    // The quantity grammar as a pattern means nothing to a reader; say what a quantity is.
    if (r.message.includes(QUANTITY)) {
      const { about, ...rest } = r;
      const h = quantityHint(e.data);
      return { ...rest, message: h.message, ...(h.did_you_mean ? { did_you_mean: h.did_you_mean } : {}) };
    }
    return r;
  });
}

/** Built-in groups: every group the target serves, plus the groups Kubernetes has removed. */
function builtinGroups(ver, pluto) {
  if (!ver.groups) {
    ver.groups = new Set([...ver.defs.byGvk.values()].map((e) => e.group));
    for (const d of pluto.values()) if (d.component === "k8s") ver.groups.add(splitApiVersion(d.apiVersion).group);
  }
  return ver.groups;
}

async function checkObject(ctx, env, it) {
  const { ver, pluto, here, podSecurityLevel } = env;
  const { obj, lineOf } = it;
  const minor = ver.minor;
  const kind = obj.kind;
  const { group, version } = splitApiVersion(obj.apiVersion);
  const object = `${kind}/${obj.metadata?.name ?? obj.metadata?.generateName ?? "(no name)"}`;
  const out = [];
  const f = (severity, rule, segs, message, extra = {}) => {
    const line = lineOf(segs, true) ?? it.line;
    out.push({ file: it.file, ...(line ? { line } : {}), object, severity, rule, ...(segs.length ? { path: displayPath(segs) } : {}), message, ...extra });
  };
  const entry = ver.defs.byGvk.get(`${obj.apiVersion}/${kind}`);
  const served = ver.defs.byKind.get(kind) ?? [];
  const dep = pluto.get(`${obj.apiVersion}/${kind}`);
  let tree = null;
  let builtin = false;

  if (entry) {
    builtin = true;
    tree = ver.treeFor(entry.def);
    // Pluto's deprecation dates are not always right; a deprecation is reported only when the
    // target also serves a newer version of the kind to move to.
    const successor = served.find((e) => versionRank(e.version) > versionRank(version));
    if (dep?.component === "k8s" && dep.deprecatedIn !== undefined && dep.deprecatedIn <= minor && successor) {
      f("warning", "deprecated-api", ["apiVersion"], `${obj.apiVersion} ${kind} is deprecated since Kubernetes 1.${dep.deprecatedIn}${dep.removedIn ? ` and removed in 1.${dep.removedIn}` : ""}.`, { fix: `apiVersion: ${successor.apiVersion}` });
    }
  } else if (served.length) {
    builtin = true;
    const wanted = dep?.replacement && served.find((e) => e.apiVersion === dep.replacement);
    const use = wanted || served.find((e) => e.group === group) || served[0];
    const when = dep?.component === "k8s" && dep.removedIn ? `was removed in Kubernetes 1.${dep.removedIn}` : `is not served by Kubernetes 1.${minor}`;
    // What else must change: the object as it would be with the replacement apiVersion.
    const moved = { ...obj, apiVersion: use.apiVersion };
    const after = schemaErrors(ver.treeFor(use.def), moved, lineOf).slice(0, 8);
    f("error", "removed-api", ["apiVersion"], `${obj.apiVersion} ${kind} ${when}; use ${use.apiVersion}.`, {
      fix: `apiVersion: ${use.apiVersion}${after.length ? `, then fix the fields listed in after_migration` : ""}`,
      ...(after.length ? { after_migration: after.map((e) => `${e.line ? `line ${e.line}: ` : ""}${e.path}: ${e.message}${e.did_you_mean ? ` (did you mean ${e.did_you_mean}?)` : ""}`) } : {}),
    });
  } else if (dep?.component === "k8s") {
    f("error", "removed-api", ["apiVersion"], `${kind} (${obj.apiVersion}) was removed in Kubernetes 1.${dep.removedIn}${dep.replacement ? `; use ${dep.replacement}` : ", with no replacement API"}.`, { fix: INSTEAD[kind] ?? (dep.replacement ? `apiVersion: ${dep.replacement}` : "remove the object") });
  } else if (builtinGroups(ver, pluto).has(group)) {
    const inGroup = [...ver.defs.byGvk.values()].filter((e) => e.group === group).map((e) => e.kind);
    const guess = nearest(kind, inGroup.length ? inGroup : [...ver.defs.byKind.keys()]);
    f("error", "unknown-kind", ["kind"], `Kubernetes 1.${minor} has no kind ${kind} in ${obj.apiVersion}.`, guess ? { did_you_mean: guess } : {});
  } else {
    if (dep && dep.component !== "k8s") {
      f("warning", "deprecated-api", ["apiVersion"], `${dep.component} deprecated ${obj.apiVersion} ${kind}${dep.deprecatedIn ? ` in ${dep.component} ${dep.deprecatedIn}` : ""}${dep.removedIn ? ` and removed it in ${dep.removedIn}` : ""}.`, dep.replacement ? { fix: `apiVersion: ${dep.replacement}` } : {});
    }
    tree = await customResourceTree(ctx, here, group, version, kind);
    if (!tree) f("info", "no-schema", ["kind"], `No schema for ${kind} (${obj.apiVersion}) in these files or the CRDs catalog; its fields were not checked.`);
  }

  if (tree) {
    const reported = new Set();
    for (const e of schemaErrors(tree, obj, lineOf)) {
      reported.add(e.path);
      // The catalog's schema for a custom resource can be older than the CRD in the cluster: a field
      // it does not know may be new rather than wrong.
      // A near miss of a known field ("duraton") is a typo whatever the CRD's age.
      const stale = tree.catalog && /^unknown property/.test(e.message) && !e.did_you_mean;
      out.push({ file: it.file, ...(e.line ? { line: e.line } : {}), object, severity: stale ? "warning" : "error", rule: "schema", path: e.path, message: stale ? `${e.message} in the CRDs catalog's schema for ${kind} ${obj.apiVersion}; if your installed CRD is newer, it may be valid` : e.message, ...(e.did_you_mean ? { did_you_mean: e.did_you_mean } : {}), ...(e.allowed ? { allowed: e.allowed } : {}), ...(e.about ? { about: e.about } : {}) });
    }
    for (const w of findWarnings(tree, withoutNulls(obj), { lineOf }, reported)) out.push({ file: it.file, ...(w.line ? { line: w.line } : {}), object, severity: "warning", rule: /^deprecated/.test(w.message) ? "deprecated-field" : "schema", path: w.path, message: w.message, ...(w.did_you_mean ? { did_you_mean: w.did_you_mean } : {}) });
  }
  if (builtin) {
    for (const x of objectChecks(obj)) f(x.severity, x.rule, x.segs, x.message, x.fix ? { fix: x.fix } : {});
    if (WORKLOAD_POD[kind] && podSecurityLevel !== "none") {
      const level = podSecurityLevel ?? "baseline";
      for (const x of podSecurity(obj, kind, level)) {
        // Asked for a level: pods that break it are refused where the namespace enforces it.
        const severity = podSecurityLevel ? "error" : "warning";
        f(severity, x.rule, x.segs, `${x.message} (Pod Security ${x.level})`, { fix: x.fix });
      }
    }
  }
  return out;
}

export async function checkManifests(ctx, { files, kubernetes_version, pod_security }) {
  const plutoLoading = deprecations(ctx);
  plutoLoading.catch(() => {});
  const { minor, note } = await resolveVersion(ctx, kubernetes_version);
  const [ver, pluto] = await Promise.all([compiledVersion(ctx, minor), plutoLoading]);
  const items = [];
  const findings = [];
  for (const file of files) {
    const { objects, problems } = parseManifests(file.content);
    for (const p of problems) findings.push({ file: file.path, ...(p.line ? { line: p.line } : {}), severity: "error", rule: "parse", message: p.message });
    for (const o of objects) items.push({ ...o, file: file.path });
  }
  const env = { ver, pluto, here: definedHere(items), podSecurityLevel: pod_security };
  for (const list of await mapLimit(items, 8, (it) => checkObject(ctx, env, it))) findings.push(...list);
  for (const x of crossChecks(items)) {
    const line = x.item.lineOf(x.segs, true) ?? x.item.line;
    findings.push({ file: x.item.file, ...(line ? { line } : {}), object: `${x.item.obj.kind}/${x.item.obj.metadata?.name ?? "(no name)"}`, severity: x.severity, rule: x.rule, path: displayPath(x.segs), message: x.message, ...(x.fix ? { fix: x.fix } : {}) });
  }
  const unique = new Set();
  for (let i = findings.length - 1; i >= 0; i--) {
    const k = `${findings[i].file}|${findings[i].line}|${findings[i].path}|${findings[i].message}`;
    if (unique.has(k)) findings.splice(i, 1);
    else unique.add(k);
  }
  findings.sort((a, b) => ORDER[a.severity] - ORDER[b.severity] || files.findIndex((f) => f.path === a.file) - files.findIndex((f) => f.path === b.file) || (a.line ?? 0) - (b.line ?? 0));
  const counts = Object.fromEntries(Object.keys(ORDER).map((k) => [k, findings.filter((x) => x.severity === k).length]).filter(([, n]) => n));
  return { kubernetes_version: `1.${minor}`, ...(note ? { note } : {}), objects: items.length, counts, findings: findings.slice(0, MAX_FINDINGS), ...(findings.length > MAX_FINDINGS ? { more_findings: findings.length - MAX_FINDINGS } : {}) };
}
