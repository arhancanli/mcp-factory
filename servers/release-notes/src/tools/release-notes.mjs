import { z } from "zod";
import { clip, compact, defineTool, ToolError } from "../kit/index.mjs";
import { noteLines, notesFor } from "../changelog.mjs";
import { resolvePackage } from "../registry.mjs";
import { compareVersions } from "../versions.mjs";
import { pickVersion, pkgInput, READ_ONLY, versionError } from "./shared.mjs";

export const releaseNotes = defineTool({
  name: "release_notes",
  title: "Notes for one version",
  description: "The release notes of one version of a package (default the latest) from its changelog or GitHub release, with the release date and link. Short lines, commit and pull-request noise removed.",
  input: { ...pkgInput, version: z.string().max(40).optional(), max_chars: z.number().int().min(500).max(30000).optional().describe("default 6000") },
  output: { package: z.string(), version: z.string(), notes: z.string() },
  annotations: READ_ONLY,
  handler: async ({ ecosystem, package: name, version, max_chars: max = 6000 }, ctx) => {
    const pkg = await resolvePackage(ctx, ecosystem, name);
    const v = pickVersion(pkg.versions, version ?? pkg.latest);
    if (!v) throw new ToolError("unknown_version", versionError(name, pkg.versions, version, compareVersions));
    const notes = await notesFor(ctx, pkg, (x) => x.replace(/^v/i, "") === v);
    const entry = notes.entries.find((e) => e.version.replace(/^v/i, "") === v);
    const date = pkg.versions.find((x) => x.version === v)?.date;
    if (!entry) {
      const nearest = notes.entries.map((e) => e.version).slice(0, 5);
      return { ...compact({ date, source: notes.source?.url, note: notes.note ?? `No notes for ${v} in ${notes.source?.kind ?? "any source"}.${nearest.length ? ` Newest with notes: ${nearest.join(", ")}.` : ""}` }), package: pkg.name, version: v, notes: "" };
    }
    return { ...compact({ date: entry.date ?? date, source: entry.url ?? notes.source?.url }), package: pkg.name, version: v, notes: clip(noteLines(entry.text).join("\n"), max) };
  },
});
