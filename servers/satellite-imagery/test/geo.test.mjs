// Coverage geometry and ranking on synthetic shapes.
import assert from "node:assert/strict";
import test from "node:test";
import { areaOf, coverage } from "../src/geo.mjs";
import { rankScenes } from "../src/tools/find-imagery.mjs";

const square = (w, s, e, n) => ({ type: "Polygon", coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] });

test("coverage: full, partial, none, holes and multipolygons", () => {
  assert.equal(coverage(square(0, 0, 2, 2), [0.5, 0.5, 1.5, 1.5]), 1);
  assert.ok(Math.abs(coverage(square(0, 0, 2, 2), [1, 0.5, 3, 1.5]) - 0.5) < 1e-9);
  assert.equal(coverage(square(0, 0, 2, 2), [3, 3, 4, 4]), 0);
  const holed = { type: "Polygon", coordinates: [[[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]], [[1, 1], [3, 1], [3, 3], [1, 3], [1, 1]]] };
  assert.ok(Math.abs(coverage(holed, [0, 0, 4, 4]) - 0.75) < 1e-9);
  const multi = { type: "MultiPolygon", coordinates: [square(0, 0, 1, 2).coordinates, square(1, 0, 2, 2).coordinates] };
  assert.ok(Math.abs(coverage(multi, [0, 0, 2, 2]) - 1) < 1e-9);
});

test("coverage: a footprint crossing the antimeridian is not taken as covering", () => {
  const crossing = { type: "Polygon", coordinates: [[[179, 0], [-179, 0], [-179, 1], [179, 1], [179, 0]]] };
  assert.equal(coverage(crossing, [179.2, 0.2, 179.8, 0.8]), 0);
});

test("areas: a point becomes a small square; bad boxes are refused", () => {
  const [w, s, e, n] = areaOf({ lat: 0, lon: 0, radius_km: 1 });
  assert.ok(Math.abs(e - w - 2 / 111.32) < 1e-9 && Math.abs(n - s - 2 / 111.32) < 1e-9);
  assert.throws(() => areaOf({ bbox: [10, 10, 5, 20] }), /west < east/);
  assert.throws(() => areaOf({}), /bbox, or lat and lon/);
});

test("ranking: best puts full coverage first, clearest and newest do what they say", () => {
  const scenes = [
    { id: "partial-clear", coverage: 0.4, cloud: 0, date: "2026-09-10" },
    { id: "full-cloudy", coverage: 1, cloud: 15, date: "2026-09-20" },
    { id: "full-clear", coverage: 1, cloud: 2, date: "2026-09-01" },
  ];
  assert.deepEqual(rankScenes(scenes, "best").map((s) => s.id), ["full-clear", "full-cloudy", "partial-clear"]);
  assert.deepEqual(rankScenes(scenes, "clearest").map((s) => s.id), ["partial-clear", "full-clear", "full-cloudy"]);
  assert.deepEqual(rankScenes(scenes, "newest").map((s) => s.id), ["full-cloudy", "partial-clear", "full-clear"]);
});

test("ranking: 99.5% counts as full coverage, so a clearer scene beats a cloudier 100% one", () => {
  const scenes = [
    { id: "full-cloudy", coverage: 1, cloud: 18, date: "2026-09-20" },
    { id: "nearly-full-clear", coverage: 0.995, cloud: 1, date: "2026-09-01" },
  ];
  assert.deepEqual(rankScenes(scenes, "best").map((s) => s.id), ["nearly-full-clear", "full-cloudy"]);
});
