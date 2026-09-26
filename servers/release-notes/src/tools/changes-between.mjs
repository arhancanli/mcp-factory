import { z } from "zod";
import { compact, defineTool, ToolError } from "../kit/index.mjs";
import { classify, noteLines, notesFor } from "../changelog.mjs";
import { resolvePackage } from "../registry.mjs";
import { compareVersions, isPrerelease, majorOf } from "../versions.mjs";
import { pickVersion, pkgInput, READ_ONLY, versionError } from "./shared.mjs";

const MAX_PER_KIND = 30;

export const changesBetween = defineTool({
  name: "changes_between",
  title: "What changed between two versions",
  description: "Before an upgrade: breaking changes, removals, deprecations, security fixes and raised requirements (Node, Python...) between two versions of a package, from its changelog or GitHub releases, each tagged with its version. to defaults to the latest.",
  input: { ...pkgInput, from: z.string().max(40).describe("current version"), to: z.string().max(40).optional(), prereleases: z.boolean().optional() },
  output: { package: z.string(), from: z.string(), to: z.string() },
  annotations: READ_ONLY,
  handler: async ({ ecosystem, package: name, from, to, prereleases }, ctx) => {
    const pkg = await resolvePackage(ctx, ecosystem, name);
    const a = pickVersion(pkg.versions, from);
    const b = pickVersion(pkg.versions, to ?? pkg.latest);
    if (!a) throw new ToolError("unknown_version", versionError(name, pkg.versions, from, compareVersions));
    if (!b) throw new ToolError("unknown_version", versionError(name, pkg.versions, to, compareVersions));
    if (compareVersions(a, b) >= 0) throw new ToolError("bad_range", `${a} is not older than ${b}.`);
    const inRange = pkg.versions.filter((v) => compareVersions(v.version, a) > 0 && compareVersions(v.version, b) <= 0 && (prereleases || !isPrerelease(v.version) || v.version === b));
    const notes = await notesFor(ctx, pkg, (v) => compareVersions(v, a) > 0 && compareVersions(v, b) <= 0);
    const byVersion = new Map(notes.entries.map((e) => [e.version.replace(/^v/i, ""), e]));
    // Pre-release notes (5.0.0-beta.1) usually carry the breaking changes of the release they lead
    // to, so they count toward it even when pre-releases are not listed.
    const covered = notes.entries.filter((e) => compareVersions(e.version, a) > 0 && compareVersions(e.version, b) <= 0);
    const kinds = {};
    for (const e of covered) {
      const c = classify(noteLines(e.text));
      for (const [k, lines] of Object.entries(c)) for (const l of lines) if (!(kinds[k] ??= []).includes(`${e.version}: ${l}`)) kinds[k].push(`${e.version}: ${l}`);
    }
    const majors = [...new Set(inRange.map((v) => majorOf(v.version)))].filter((m) => m > majorOf(a));
    const missing = inRange.filter((v) => !byVersion.has(v.version)).map((v) => v.version);
    const cap = (list) => (list && list.length > MAX_PER_KIND ? [...list.slice(0, MAX_PER_KIND), `... ${list.length - MAX_PER_KIND} more`] : list);
    return {
      ...compact({
        versions: inRange.length,
        major_upgrades: majors.length ? majors.map((m) => `${m}.x`) : undefined,
        from_date: pkg.versions.find((v) => v.version === a)?.date,
        to_date: pkg.versions.find((v) => v.version === b)?.date,
        breaking: cap(kinds.breaking),
        removed: cap(kinds.removed),
        deprecated: cap(kinds.deprecated),
        security: cap(kinds.security),
        requirements: cap(kinds.requirements),
        source: notes.source?.url,
        without_notes: missing.length ? (missing.length > 15 ? `${missing.length} versions, e.g. ${missing.slice(-5).join(", ")}` : missing.join(", ")) : undefined,
        note: notes.note ?? (!notes.entries.length ? "No release notes found (no CHANGELOG file, no GitHub releases)." : !covered.length ? "The notes found do not cover this range." : undefined),
      }),
      package: pkg.name,
      from: a,
      to: b,
    };
  },
});
