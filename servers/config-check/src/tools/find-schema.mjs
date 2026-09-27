import { z } from "zod";
import { clip, compact, defineTool } from "../kit/index.mjs";
import { catalog, matchPath } from "../catalog.mjs";
import { READ_ONLY } from "./shared.mjs";

export const findSchema = defineTool({
  name: "find_schema",
  title: "Which schema covers this file?",
  description: "Which SchemaStore schema applies to a file (give its path or name) or matches words (kubernetes, eslint flat config): name, URL and the file names it covers, best match first. Use the name or URL as validate_config's or config_help's schema.",
  input: { query: z.string().min(1).max(200).describe("a file path or name, or words") },
  output: { schemas: z.array(z.looseObject({ name: z.string(), url: z.string() })) },
  annotations: READ_ONLY,
  handler: async ({ query }, ctx) => {
    const c = await catalog(ctx);
    const q = query.trim();
    const out = new Map();
    const add = (s, matched_by) => {
      if (out.has(s.url) || out.size >= 10) return;
      out.set(s.url, compact({ name: s.name, url: s.url, file_names: s.fileMatch.slice(0, 6), description: s.description && clip(s.description, 160), matched_by }));
    };
    if (/[./]/.test(q) && !/\s/.test(q)) for (const { s } of matchPath(c, q).slice(0, 5)) add(s, "file name");
    const words = q
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 1);
    if (words.length) {
      const scored = [];
      for (const s of c.schemas) {
        const name = s.name.toLowerCase();
        const files = s.fileMatch.join(" ").toLowerCase();
        const desc = s.description.toLowerCase();
        if (!words.every((w) => name.includes(w) || files.includes(w) || desc.includes(w))) continue;
        const score = words.reduce((a, w) => a + (name.includes(w) ? 3 : 0) + (files.includes(w) ? 2 : 0) + (desc.includes(w) ? 1 : 0), 0) - name.length / 100;
        scored.push({ s, score });
      }
      scored.sort((a, b) => b.score - a.score);
      for (const { s } of scored) add(s, "words");
    }
    return { schemas: [...out.values()] };
  },
});
