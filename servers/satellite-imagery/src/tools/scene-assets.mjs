import { z } from "zod";
import { compact, defineTool } from "../kit/index.mjs";
import { COLLECTIONS, getItem, itemUrl } from "../stac.mjs";
import { READ_ONLY } from "./find-imagery.mjs";

const SKIP = /-jp2$|metadata|^mtl\.|^schema-|manifest|^ang$/;

export const sceneAssets = defineTool({
  name: "scene_assets",
  title: "Scene bands and files",
  description: "Lists the bands and files of one scene found with find_imagery: key, title, common band name, resolution, media type and download URL, with the scene's date, cloud cover, projection and footprint bbox.",
  input: {
    collection: z.enum(Object.keys(COLLECTIONS)),
    id: z.string().min(3).max(200),
  },
  output: { id: z.string(), assets: z.array(z.looseObject({ key: z.string(), href: z.string() })) },
  annotations: READ_ONLY,
  handler: async ({ collection, id }, ctx) => {
    const it = await getItem(ctx, collection, id);
    const p = it.properties ?? {};
    const assets = Object.entries(it.assets ?? {})
      .filter(([k]) => !SKIP.test(k))
      .map(([key, a]) => {
        const band = a["eo:bands"]?.[0] ?? a.bands?.[0];
        const gsd = a.gsd ?? a["raster:bands"]?.[0]?.spatial_resolution ?? band?.gsd;
        return compact({ key, title: a.title, band: band?.common_name, wavelength_um: band?.center_wavelength, resolution_m: gsd, type: a.type?.split(";")[0], href: a.href, requester_pays: a.href?.startsWith("s3://") ? true : undefined });
      });
    return {
      id: it.id,
      assets,
      ...compact({
        collection: COLLECTIONS[collection].title,
        date: String(p.datetime ?? p.start_datetime ?? "").slice(0, 19),
        cloud_cover: p["eo:cloud_cover"],
        platform: p.platform,
        epsg: p["proj:epsg"] ?? p["proj:code"],
        bbox: it.bbox,
        licence: COLLECTIONS[collection].licence,
        item: itemUrl(collection, it.id),
      }),
    };
  },
});
