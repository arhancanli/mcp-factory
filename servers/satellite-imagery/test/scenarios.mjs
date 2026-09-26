// The calls the golden tests replay and scripts/perf.mjs times. test/record.mjs runs them against
// Earth Search and stores the responses, compressed, in test/fixtures.
export const NOW = Date.parse("2026-09-26T12:00:00Z");

export const SCENARIOS = [
  { label: "find_imagery: Sentinel-2 around a point in Dubai, 8 weeks", tool: "find_imagery", args: { lat: 25.197, lon: 55.274, start: "2026-08-01", end: "2026-09-26", limit: 3 }, example: true },
  { label: "find_imagery: Landsat over San Francisco, a summer", tool: "find_imagery", args: { bbox: [-122.52, 37.7, -122.35, 37.83], start: "2026-06-01", end: "2026-09-26", collection: "landsat", limit: 2 } },
  { label: "find_imagery: Sentinel-1 radar over London, newest first", tool: "find_imagery", args: { lat: 51.5, lon: -0.12, start: "2026-09-01", end: "2026-09-26", collection: "sentinel-1", limit: 2, sort: "newest" } },
  { label: "scene_assets: one Sentinel-2 scene", tool: "scene_assets", args: { collection: "sentinel-2", id: "S2B_T40RCN_20260830T065854_L2A" } },
  { label: "find_imagery: open ocean, no cloud allowed", tool: "find_imagery", args: { lat: 0, lon: -160, start: "2026-09-01", end: "2026-09-02", max_cloud: 0 } },
  { label: "scene_assets: an id that does not exist", tool: "scene_assets", args: { collection: "sentinel-2", id: "S2X_NOT_A_SCENE" }, expectError: true },
];
