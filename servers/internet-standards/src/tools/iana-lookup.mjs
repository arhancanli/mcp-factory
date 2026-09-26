import { z } from "zod";
import { compact, defineTool, ToolError } from "../kit/index.mjs";
import { matchRows, parseReferences, REGISTRIES, registryUrl } from "../iana.mjs";

export const MAX_ENTRIES = 10;

export const ianaLookup = defineTool({
  name: "iana_lookup",
  title: "IANA registry lookup",
  description: "Looks up an entry in an IANA registry (HTTP status codes, fields, methods; media types; URI schemes; port numbers; TLS cipher suites; link relations; DNS record types) by exact value or name, else by text. Returns the entry and its defining RFC section.",
  input: {
    registry: z.enum(Object.keys(REGISTRIES)),
    query: z.string().min(1).max(200),
  },
  output: { registry: z.string(), exact: z.boolean(), total: z.number(), entries: z.array(z.looseObject({})) },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  handler: async ({ registry, query }, { store }) => {
    const reg = REGISTRIES[registry];
    const rows = (await Promise.all(reg.files.map((f) => store.registryRows(f)))).flat();
    const { exact, rows: hits } = matchRows(rows, reg, query);
    if (!hits.length) throw new ToolError("no_match", `Nothing in the ${reg.title} registry matches "${query}".`);
    const entries = hits.slice(0, MAX_ENTRIES).map((r) => {
      const refs = parseReferences(r.Reference);
      return compact({ ...Object.fromEntries(Object.entries(r).filter(([, v]) => v !== "")), rfcs: refs.length ? refs.map((x) => `RFC ${x.rfc}${x.section ? ` section ${x.section}` : ""}`) : undefined });
    });
    return { registry: reg.title, url: registryUrl(reg), exact, total: hits.length, entries, ...(hits.length > MAX_ENTRIES ? { truncated: hits.length - MAX_ENTRIES } : {}) };
  },
});
