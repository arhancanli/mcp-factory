// src/stac.mjs
//
// Earth Search (Element 84), a public STAC API over the AWS Open Data copies of Sentinel, Landsat
// and NAIP. No key. Searches are POSTed (STAC item search) with a cloud-cover filter; the matching
// scenes are then ranked here by how much of the area they cover (geo.mjs), clearness and date.
import { ToolError } from "./kit/index.mjs";

export const API = "https://earth-search.aws.element84.com/v1";
export const HOSTS = ["earth-search.aws.element84.com"];

// What each collection is and may be used for. The STAC records label every collection
// "proprietary"; these are the actual terms of the data providers.
export const COLLECTIONS = {
  "sentinel-2": {
    id: "sentinel-2-c1-l2a",
    title: "Sentinel-2 surface reflectance (Collection 1, L2A), 10 m, every 5 days",
    optical: true,
    licence: "Copernicus Sentinel data: free and open use; credit 'Contains modified Copernicus Sentinel data [year]'.",
    visual: "visual",
  },
  landsat: {
    id: "landsat-c2-l2",
    title: "Landsat 8 and 9 surface reflectance (Collection 2, Level 2), 30 m, every 8 days",
    optical: true,
    licence: "USGS Landsat data: public domain; credit 'Landsat imagery courtesy of the U.S. Geological Survey'. The files are in a requester-pays AWS bucket: downloading them is billed to the downloader.",
    visual: "reduced_resolution_browse",
  },
  "sentinel-1": {
    id: "sentinel-1-grd",
    title: "Sentinel-1 radar (GRD), sees through cloud and at night",
    optical: false,
    licence: "Copernicus Sentinel data: free and open use; credit 'Contains modified Copernicus Sentinel data [year]'. The files are in a requester-pays AWS bucket: downloading them is billed to the downloader.",
  },
  naip: {
    id: "naip",
    title: "NAIP aerial imagery of the continental US, about 1 m, 2010 to 2022",
    optical: true,
    licence: "USDA NAIP imagery: public domain. The files are in a requester-pays AWS bucket: downloading them is billed to the downloader.",
    visual: "image",
  },
};

export const SEARCH_LIMIT = 50;

/** One page of STAC items for an area and period, clearest first for optical collections. */
export async function searchItems(ctx, { collection, area, start, end, maxCloud }) {
  const c = COLLECTIONS[collection];
  const body = {
    collections: [c.id],
    bbox: area,
    datetime: `${start}T00:00:00Z/${end}T23:59:59Z`,
    limit: SEARCH_LIMIT,
    ...(c.optical && maxCloud < 100 ? { query: { "eo:cloud_cover": { lte: maxCloud } } } : {}),
    sortby: [{ field: c.optical ? "properties.eo:cloud_cover" : "properties.datetime", direction: c.optical ? "asc" : "desc" }],
  };
  const res = await ctx.fetcher.request(`${API}/search`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), accept: "application/geo+json", idempotent: true });
  if (!res.ok) throw new ToolError("upstream_status", `Earth Search answered with status ${res.status}.`);
  const d = JSON.parse(res.text);
  return { matched: d.numberMatched ?? d.context?.matched, items: d.features ?? [] };
}

export async function getItem(ctx, collection, id) {
  const c = COLLECTIONS[collection];
  const { status, data } = await ctx.fetcher.getJson(`${API}/collections/${encodeURIComponent(c.id)}/items/${encodeURIComponent(id)}`, { allowStatus: [404] });
  if (status === 404) throw new ToolError("scene_not_found", `No ${collection} scene ${id} in Earth Search.`);
  return data;
}

export const itemUrl = (collection, id) => `${API}/collections/${COLLECTIONS[collection].id}/items/${encodeURIComponent(id)}`;
