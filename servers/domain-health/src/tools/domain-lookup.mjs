import { z } from "zod";
import { compact, defineTool, mapLimit, ToolError } from "../kit/index.mjs";
import { normName } from "../dns.mjs";
import { lookupDomain } from "../rdap.mjs";
import { READ_ONLY } from "./shared.mjs";

export const domainLookup = defineTool({
  name: "domain_lookup",
  title: "Registration and availability",
  description: "Registration of up to 20 domains from each registry's RDAP server: registered or likely available, registrar, created and expiry dates, days left, status codes, DNSSEC, name servers. Subdomains resolve to their registrable domain.",
  input: { domains: z.array(z.string().max(253)).min(1).max(20) },
  output: { results: z.array(z.looseObject({ domain: z.string() })) },
  annotations: READ_ONLY,
  handler: async ({ domains }, ctx) => {
    const results = await mapLimit(domains, 5, async (raw) => {
      try {
        const name = normName(raw);
        const r = await lookupDomain(ctx, name);
        return compact({ ...r, asked: r.domain !== name ? name : undefined });
      } catch (err) {
        if (err instanceof ToolError) return { domain: raw, error: err.code, note: err.message };
        throw err;
      }
    });
    return { results };
  },
});
