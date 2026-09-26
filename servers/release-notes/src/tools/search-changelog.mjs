import { z } from "zod";
import { compact, defineTool } from "../kit/index.mjs";
import { isLabel, noteLines, notesFor } from "../changelog.mjs";
import { resolvePackage } from "../registry.mjs";
import { pkgInput, READ_ONLY } from "./shared.mjs";

const MAX_HITS = 25;

export const searchChangelog = defineTool({
  name: "search_changelog",
  title: "Find when something changed",
  description: "Finds the versions whose release notes mention a term (an API name, an option, 'deprecated', a CVE): each matching line with its version and date, oldest first, so you can see when something was added, deprecated or removed.",
  input: { ...pkgInput, text: z.string().max(120) },
  output: { package: z.string(), total: z.number(), hits: z.array(z.string()) },
  annotations: READ_ONLY,
  handler: async ({ ecosystem, package: name, text }, ctx) => {
    const pkg = await resolvePackage(ctx, ecosystem, name);
    const notes = await notesFor(ctx, pkg);
    const needle = text.trim().toLowerCase();
    const words = needle.split(/\s+/).filter(Boolean);
    const hits = [];
    for (const e of [...notes.entries].reverse()) {
      // A hit under a section label ("remove:", "### Deprecated") names it: that is often the answer.
      let label;
      for (const line of noteLines(e.text)) {
        if (isLabel(line)) {
          label = line.replace(/^#+\s*|\*\*|:$/g, "").trim().toLowerCase();
          continue;
        }
        const l = line.toLowerCase();
        const short = line.length > 220 ? `${line.slice(0, 217)}...` : line;
        if (l.includes(needle) || (words.length > 1 && words.every((w) => l.includes(w)))) hits.push(`${e.version}${e.date ? ` (${e.date})` : ""}${label ? ` [${label}]` : ""}: ${short}`);
      }
    }
    return {
      ...compact({ source: notes.source?.url, note: notes.note ?? (hits.length > MAX_HITS ? `${hits.length - MAX_HITS} more; the oldest are shown first.` : undefined) }),
      package: pkg.name,
      total: hits.length,
      hits: hits.slice(0, MAX_HITS),
    };
  },
});
