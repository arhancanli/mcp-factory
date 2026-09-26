import { z } from "zod";
import { compact, defineTool } from "../kit/index.mjs";
import { normName, query, TYPES } from "../dns.mjs";
import { READ_ONLY } from "./shared.mjs";

const TYPE_NAMES = Object.keys(TYPES);
const MAX_PER_TYPE = 25;

export const dnsLookup = defineTool({
  name: "dns_lookup",
  title: "DNS records",
  description: "DNS records of a name by type (default A, AAAA, MX, NS, TXT, CAA) with TTLs, from Cloudflare's resolver; compare: true also asks Google's and flags differences (propagation). Says when DNSSEC validated the answer.",
  input: { name: z.string().max(253), types: z.array(z.enum(TYPE_NAMES)).max(8).optional(), compare: z.boolean().optional() },
  output: { name: z.string(), records: z.record(z.string(), z.unknown()) },
  annotations: READ_ONLY,
  handler: async ({ name: raw, types, compare }, ctx) => {
    const name = normName(raw);
    const want = types?.length ? types : ["A", "AAAA", "MX", "NS", "TXT", "CAA"];
    const rows = await Promise.all(
      want.map(async (type) => {
        const cf = await query(ctx, name, type, "cloudflare");
        const g = compare ? await query(ctx, name, type, "google") : undefined;
        const set = (r) => r.answers.map((a) => a.data).sort().join("\n");
        return [type, { status: cf.status, ad: cf.ad, rows: cf.answers.map((a) => `${a.data} (ttl ${a.ttl})`), differs: g && set(g) !== set(cf) ? g.answers.map((a) => a.data) : undefined }];
      }),
    );
    const records = {};
    let validated = false;
    let nx = false;
    for (const [type, r] of rows) {
      validated ||= r.ad;
      nx ||= r.status === "NXDOMAIN";
      const rowsShown = r.rows.length > MAX_PER_TYPE ? [...r.rows.slice(0, MAX_PER_TYPE), `... ${r.rows.length - MAX_PER_TYPE} more`] : r.rows;
      if (r.rows.length || r.differs) records[type] = r.differs ? { cloudflare: rowsShown, google: r.differs.slice(0, MAX_PER_TYPE) } : rowsShown;
    }
    return compact({ name, exists: nx ? false : undefined, dnssec_validated: validated || undefined, records, empty: want.filter((t) => !records[t]).join(", ") || undefined });
  },
});
