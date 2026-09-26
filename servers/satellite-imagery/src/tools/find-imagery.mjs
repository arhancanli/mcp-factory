import { z } from "zod";
import { compact, defineTool, ToolError } from "../kit/index.mjs";
import { areaOf, coverage } from "../geo.mjs";
import { COLLECTIONS, itemUrl, searchItems } from "../stac.mjs";

export const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const round = (x, d = 1) => Math.round(x * 10 ** d) / 10 ** d;

/** Order: "best" = most of the area covered, then clearest, then newest. */
export function rankScenes(scenes, sort) {
  const by = {
    // Scenes covering 99% or more count as full: among them cloud cover decides, not the last 1%.
    best: (a, b) => {
      const fullA = a.coverage >= 0.99;
      const fullB = b.coverage >= 0.99;
      if (fullA !== fullB) return fullB - fullA;
      return (fullA ? 0 : b.coverage - a.coverage) || (a.cloud ?? 0) - (b.cloud ?? 0) || b.date.localeCompare(a.date);
    },
    clearest: (a, b) => (a.cloud ?? 0) - (b.cloud ?? 0) || b.coverage - a.coverage || b.date.localeCompare(a.date),
    newest: (a, b) => b.date.localeCompare(a.date) || b.coverage - a.coverage,
  }[sort];
  return [...scenes].sort(by);
}

export const findImagery = defineTool({
  name: "find_imagery",
  title: "Find satellite imagery",
  description: "Finds satellite scenes of an area (bbox or lat/lon) between two dates: Sentinel-2, Landsat, Sentinel-1 radar or NAIP. Ranks by how much of the area each scene covers, cloud cover and date, and returns preview, true-colour image and STAC item links with the data licence.",
  input: {
    bbox: z.array(z.number().min(-180).max(180)).length(4).optional().describe("[west, south, east, north]"),
    lat: z.number().min(-90).max(90).optional(),
    lon: z.number().min(-180).max(180).optional(),
    radius_km: z.number().min(0.1).max(50).optional().describe("Around lat/lon; default 1"),
    start: z.string().regex(DAY).max(10).describe("YYYY-MM-DD"),
    end: z.string().regex(DAY).max(10).optional().describe("YYYY-MM-DD, default today"),
    collection: z.enum(Object.keys(COLLECTIONS)).optional().describe("Default sentinel-2"),
    max_cloud: z.number().min(0).max(100).optional().describe("Percent, default 20"),
    sort: z.enum(["best", "clearest", "newest"]).optional(),
    limit: z.number().int().min(1).max(10).optional(),
  },
  output: { collection: z.string(), area: z.array(z.number()), matched: z.number(), scenes: z.array(z.looseObject({ id: z.string(), date: z.string() })) },
  annotations: READ_ONLY,
  handler: async (args, ctx) => {
    const { start, collection = "sentinel-2", max_cloud = 20, sort = "best", limit = 5 } = args;
    const end = args.end ?? new Date(ctx.now?.() ?? Date.now()).toISOString().slice(0, 10);
    if (end < start) throw new ToolError("bad_dates", "end is before start.");
    let area;
    try {
      area = areaOf(args);
    } catch (err) {
      throw new ToolError("bad_area", `${err.message}.`);
    }
    const c = COLLECTIONS[collection];
    const { matched, items } = await searchItems(ctx, { collection, area, start, end, maxCloud: max_cloud });
    const scenes = items.map((it) => {
      const p = it.properties ?? {};
      const cover = coverage(it.geometry, area);
      const visual = c.visual && it.assets?.[c.visual]?.href;
      return {
        id: it.id,
        date: String(p.datetime ?? p.start_datetime ?? "").slice(0, 19),
        cloud: typeof p["eo:cloud_cover"] === "number" ? p["eo:cloud_cover"] : undefined,
        coverage: cover,
        platform: p.platform,
        thumbnail: it.assets?.thumbnail?.href,
        true_color: visual,
        item: itemUrl(collection, it.id),
      };
    });
    const ranked = rankScenes(scenes.filter((s) => s.coverage > 0), sort).slice(0, limit);
    const out = {
      collection: c.title,
      area: area.map((x) => round(x, 6)),
      matched: matched ?? items.length,
      // s3:// links are in requester-pays buckets: downloading them is billed to the downloader.
      scenes: ranked.map((s) => compact({ id: s.id, date: s.date, cloud_cover: s.cloud === undefined ? undefined : round(s.cloud), area_covered_pct: round(s.coverage * 100), platform: s.platform, thumbnail: s.thumbnail, true_color: s.true_color, requester_pays: [s.thumbnail, s.true_color].some((h) => h?.startsWith("s3://")) || undefined, item: s.item })),
    };
    const notes = [];
    if (!ranked.length) notes.push(c.optical ? `No scene with cloud cover at or below ${max_cloud}% covers this area between ${start} and ${end}. Try a higher max_cloud or a wider date range.` : `No scene covers this area between ${start} and ${end}.`);
    if ((matched ?? 0) > items.length) notes.push(`${items.length} of ${matched} matching scenes were ranked (the ${c.optical ? "clearest" : "newest"} first).`);
    return { ...out, ...compact({ examined: items.length, licence: c.licence, note: notes.join(" ") || undefined }) };
  },
});
