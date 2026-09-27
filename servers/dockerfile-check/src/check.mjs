// src/check.mjs
//
// check_dockerfile: syntax (dockerfile-utils, the validator behind VS Code's Dockerfile support),
// the rules in src/rules.mjs, and every base image against its registry and endoflife.date.
import { mapLimit } from "./kit/index.mjs";
import { ValidationSeverity, validate } from "dockerfile-utils";
import { imageFacts } from "./images.mjs";
import { parseImage } from "./registry.mjs";
import { initialArgs, lint, parseDockerfile, stagesOf, substitute } from "./rules.mjs";

const ORDER = { error: 0, warning: 1, info: 2 };
const STALE_DAYS = 180;

// The validator's defaults, minus the checks src/rules.mjs makes with a fix attached.
const VALIDATOR = {
  deprecatedMaintainer: ValidationSeverity.WARNING,
  directiveCasing: ValidationSeverity.WARNING,
  emptyContinuationLine: ValidationSeverity.WARNING,
  instructionCasing: ValidationSeverity.WARNING,
  instructionCmdMultiple: ValidationSeverity.IGNORE,
  instructionEntrypointMultiple: ValidationSeverity.IGNORE,
  instructionHealthcheckMultiple: ValidationSeverity.WARNING,
  instructionJSONInSingleQuotes: ValidationSeverity.IGNORE,
  instructionWorkdirRelative: ValidationSeverity.WARNING,
};

function syntaxFindings(content) {
  return validate(content, VALIDATOR).map((d) => ({ line: d.range.start.line + 1, severity: d.severity === 1 ? "error" : d.severity === 2 ? "warning" : "info", rule: "syntax", message: d.message.replace(/\.?$/, ".") }));
}

/** Findings about one base image, from its facts. */
export function imageFindings(line, ref, facts, now = Date.now()) {
  const out = [];
  const add = (severity, rule, message, fix) => out.push({ line, severity, rule, message, ...(fix ? { fix } : {}) });
  const p = parseImage(ref);
  if (p.implicitTag || p.tag === "latest") add("warning", "unpinned-image", `${facts.image} is ${p.implicitTag ? "untagged (latest)" : "the moving latest tag"}: each build may start from a different image.`, facts.pin ? `pin a version tag, or the digest: FROM ${facts.pin}` : "pin a version tag");
  if (facts.unchecked) {
    add("info", "image-unchecked", `${facts.image}: ${facts.unchecked}.`);
    return out;
  }
  if (facts.exists === false) {
    add("error", "image-not-found", `${facts.image} does not exist${facts.note ? ` (${facts.note})` : ""}; the build fails at this FROM.${facts.deprecated ? ` Note: ${facts.deprecated}.` : ""}`, facts.nearest_tags?.length ? `existing tags: ${facts.nearest_tags.join(", ")}` : facts.error);
    return out;
  }
  if (facts.missing_platform) add("error", "missing-platform", `${facts.image} is not built for ${facts.missing_platform} (it is built for ${facts.platforms.join(", ")}).`, "pick an image or tag that is, or build for a platform it has");
  if (facts.deprecated) add("warning", "deprecated-image", `${facts.image}: ${facts.deprecated}.`);
  let eolReported = false;
  for (const l of facts.lifecycle ?? []) {
    const what = `${l.product} ${l.cycle}`;
    if (l.status === "end_of_life" || l.status === "extended_only") {
      eolReported = true;
      const to = l.role === "runtime" && facts.upgrade_image ? `use ${facts.upgrade_image}` : l.upgrade_to ? `move to ${l.product} ${l.upgrade_to}${l.nearest_supported ? ` (or ${l.nearest_supported}, the nearest supported)` : ""}` : undefined;
      add("warning", "end-of-life", `${facts.image} is built on ${what}, ${l.status === "extended_only" ? "past its end of life except for paid extended support" : "past its end of life"}${l.eol ? ` (${l.eol})` : ""}: no more security fixes.`, to);
    } else if (l.days_left !== undefined && l.days_left < 90) add("warning", "end-of-life-soon", `${what} (in ${facts.image}) reaches its end of life in ${l.days_left} days (${l.eol}).`, l.upgrade_to ? `plan the move to ${l.product} ${l.upgrade_to}` : undefined);
  }
  if (!eolReported && facts.updated && (now - Date.parse(facts.updated)) / 86_400_000 > STALE_DAYS) add("warning", "stale-image", `${facts.image} was last rebuilt on ${facts.updated}: it no longer receives security updates, and the tag is probably retired.`, "move to a tag that is still rebuilt");
  return out;
}

/** One Dockerfile: its findings, and what each base image resolved to. */
export async function checkDockerfile(ctx, { path, content }, { platform, now = Date.now() } = {}) {
  const findings = syntaxFindings(content);
  let df;
  try {
    df = parseDockerfile(content);
  } catch (err) {
    return { path, findings: [...findings, { severity: "error", rule: "syntax", message: `The Dockerfile could not be parsed: ${String(err.message).slice(0, 160)}` }], images: [] };
  }
  const own = lint(df);
  // The validator's "Invalid proto"/"Invalid port" on an EXPOSE line says less than the rule's.
  const portLines = new Set(own.filter((f) => f.rule === "invalid-port").map((f) => f.line));
  for (let i = findings.length - 1; i >= 0; i--) if (portLines.has(findings[i].line) && /proto|port/i.test(findings[i].message)) findings.splice(i, 1);
  findings.push(...own);
  const args = initialArgs(df);
  const stageNames = new Set();
  const refs = [];
  for (const stage of stagesOf(df)) {
    const raw = stage.from.getImage();
    if (raw) {
      const ref = substitute(raw, args);
      const lower = ref?.toLowerCase();
      if (!ref) findings.push({ line: stage.line, severity: "info", rule: "image-unchecked", message: `FROM ${raw} uses a build argument without a default; the image was not checked.` });
      else if (lower !== "scratch" && !stageNames.has(lower)) {
        const flag = stage.from.getPlatformFlag?.()?.getValue();
        refs.push({ line: stage.line, ref, platform: flag && !flag.includes("$") ? flag : platform });
      }
    }
    if (stage.name) stageNames.add(stage.name);
  }
  const images = await mapLimit(refs, 4, async (r) => ({ line: r.line, ref: r.ref, facts: await imageFacts(ctx, r.ref, { now, platform: r.platform }) }));
  for (const im of images) findings.push(...imageFindings(im.line, im.ref, im.facts, now));
  findings.sort((a, b) => ORDER[a.severity] - ORDER[b.severity] || (a.line ?? 0) - (b.line ?? 0));
  const counts = Object.fromEntries(Object.keys(ORDER).map((k) => [k, findings.filter((f) => f.severity === k).length]).filter(([, n]) => n));
  return {
    path,
    counts,
    findings,
    images: images.map(({ line, facts }) => {
      const { registry, lifecycle, ...rest } = facts;
      return { line, ...rest, ...(lifecycle ? { lifecycle: lifecycle.map((l) => `${l.product} ${l.cycle}: ${l.status.replace(/_/g, " ")}${l.eol ? ` (end of life ${l.eol})` : ""}`) } : {}) };
    }),
  };
}
