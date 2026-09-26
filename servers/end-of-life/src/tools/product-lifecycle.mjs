import { z } from "zod";
import { compact, defineTool } from "../kit/index.mjs";
import { daysUntil, productReleases, resolveProduct, statusOf, upgradeTarget } from "../eol.mjs";
import { READ_ONLY } from "./check-versions.mjs";

export const productLifecycle = defineTool({
  name: "product_lifecycle",
  title: "A product's release cycles",
  description: "Every maintained release cycle of a product (and the most recent ended ones) with status, release, end-of-active-support and end-of-life dates, LTS flag and latest patch, plus the recommended upgrade target.",
  input: {
    product: z.string().min(1).max(100),
    include_ended: z.number().int().min(0).max(30).optional().describe("How many ended cycles to include; default 3"),
  },
  output: { product: z.string(), cycles: z.array(z.looseObject({ cycle: z.string(), status: z.string() })) },
  annotations: READ_ONLY,
  handler: async ({ product, include_ended = 3 }, ctx) => {
    const now = ctx.now?.() ?? Date.now();
    const p = await productReleases(ctx, await resolveProduct(ctx, product));
    const rows = p.releases.map((r) => {
      const status = statusOf(r, now);
      return compact({ cycle: String(r.name), status, codename: r.codename ?? undefined, lts: r.isLts || undefined, released: r.releaseDate, active_until: r.eoasFrom ?? undefined, eol: r.eolFrom ?? undefined, days_left: status === "end_of_life" ? undefined : daysUntil(r.eolFrom, now), latest: r.latest?.name });
    });
    const live = rows.filter((r) => r.status !== "end_of_life");
    const ended = rows.filter((r) => r.status === "end_of_life").slice(0, include_ended);
    return { product: p.name, cycles: [...live, ...ended], ...compact({ label: p.label, ended_total: rows.length - live.length, upgrade_to: upgradeTarget(p.releases, now), link: p.link }) };
  },
});
