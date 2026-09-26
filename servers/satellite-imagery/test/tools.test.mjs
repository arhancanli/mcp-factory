// Golden tests: both tools over a real MCP client, replaying responses recorded by test/record.mjs.
// No test here touches the network.
import assert from "node:assert/strict";
import test from "node:test";
import { call, connect, replayFetch } from "./replay.mjs";

test("find_imagery: scenes that fully cover the area come first, then the clearest, with links and licence", async () => {
  const client = await connect();
  const { res, data } = await call(client, "find_imagery", { lat: 25.197, lon: 55.274, start: "2026-08-01", end: "2026-09-26", limit: 3 });
  assert.ok(!res.isError);
  assert.match(data.collection, /^Sentinel-2/);
  assert.ok(data.scenes.length > 0 && data.scenes.length <= 3);
  assert.ok(data.scenes.every((s) => s.area_covered_pct === 100));
  assert.ok(data.scenes.every((s) => s.cloud_cover <= 20));
  const covers = data.scenes.map((s) => s.cloud_cover);
  assert.deepEqual(covers, [...covers].sort((a, b) => a - b), "clearest first among full-coverage scenes");
  assert.match(data.scenes[0].true_color, /\/TCI\.tif$/);
  assert.match(data.scenes[0].item, /^https:\/\/earth-search\.aws\.element84\.com\/v1\/collections\/sentinel-2-c1-l2a\/items\//);
  assert.match(data.licence, /Copernicus/);
  assert.ok(data.area.every((x) => Math.abs(x * 1e6 - Math.round(x * 1e6)) < 1e-6), "area rounded to 6 decimals");
});

test("find_imagery: Landsat by bbox, flagged as requester-pays", async () => {
  const client = await connect();
  const { data } = await call(client, "find_imagery", { bbox: [-122.52, 37.7, -122.35, 37.83], start: "2026-06-01", end: "2026-09-26", collection: "landsat", limit: 2 });
  assert.match(data.collection, /^Landsat/);
  assert.ok(data.scenes.every((s) => s.requester_pays === true));
  assert.match(data.licence, /public domain/);
});

test("find_imagery: radar has no cloud filter and sorts newest first", async () => {
  const { impl, calls } = replayFetch();
  const client = await connect(impl);
  const { data } = await call(client, "find_imagery", { lat: 51.5, lon: -0.12, start: "2026-09-01", end: "2026-09-26", collection: "sentinel-1", limit: 2, sort: "newest" });
  assert.ok(data.scenes.every((s) => s.cloud_cover === undefined));
  assert.ok(data.scenes[0].date >= data.scenes[1].date);
  assert.ok(!calls.some((c) => c.includes("eo:cloud_cover")), "no cloud filter sent for radar");
});

test("find_imagery: nothing found says why and what to change", async () => {
  const client = await connect();
  const { res, data } = await call(client, "find_imagery", { lat: 0, lon: -160, start: "2026-09-01", end: "2026-09-02", max_cloud: 0 });
  assert.ok(!res.isError);
  assert.deepEqual(data.scenes, []);
  assert.match(data.note, /higher max_cloud or a wider date range/);
});

test("find_imagery: bad input is refused before any request", async () => {
  const { impl, calls } = replayFetch();
  const client = await connect(impl);
  const noArea = await call(client, "find_imagery", { start: "2026-09-01" });
  assert.equal(noArea.data.error.code, "bad_area");
  const backwards = await call(client, "find_imagery", { lat: 1, lon: 1, start: "2026-09-10", end: "2026-09-01" });
  assert.equal(backwards.data.error.code, "bad_dates");
  const flipped = await call(client, "find_imagery", { bbox: [10, 10, 5, 20], start: "2026-09-01" });
  assert.equal(flipped.data.error.code, "bad_area");
  assert.equal(calls.length, 0);
});

test("scene_assets: bands with names, wavelengths and resolution; metadata files left out; missing scenes explicit", async () => {
  const client = await connect();
  const { data } = await call(client, "scene_assets", { collection: "sentinel-2", id: "S2B_T40RCN_20260830T065854_L2A" });
  const red = data.assets.find((a) => a.key === "red");
  assert.deepEqual([red.band, red.wavelength_um, red.resolution_m], ["red", 0.665, 10]);
  assert.ok(data.assets.every((a) => !/-jp2$|metadata/.test(a.key)));
  const missing = await call(client, "scene_assets", { collection: "sentinel-2", id: "S2X_NOT_A_SCENE" });
  assert.equal(missing.data.error.code, "scene_not_found");
});
