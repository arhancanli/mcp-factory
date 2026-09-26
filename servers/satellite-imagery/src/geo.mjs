// src/geo.mjs
//
// How much of the area asked about a scene actually covers. A catalogue returns every scene whose
// footprint touches the area, including slivers at a tile's edge; ranking needs the covered share.
// Footprints are clipped to the area's rectangle (Sutherland-Hodgman) and measured with the
// shoelace formula in longitude and latitude, with longitude scaled by cos(latitude) so shares are
// right away from the equator. Good for areas up to a few hundred kilometres across, which is what
// scene selection deals with; areas crossing the antimeridian are refused.

/** [west, south, east, north] from a bbox, or a small square around a point (radius in km). */
export function areaOf({ bbox, lat, lon, radius_km = 1 }) {
  if (bbox) {
    const [w, s, e, n] = bbox;
    if (!(w < e && s < n)) throw new Error("bbox must be [west, south, east, north] with west < east and south < north");
    if (w < -180 || e > 180 || s < -90 || n > 90) throw new Error("bbox is outside longitude -180..180 or latitude -90..90");
    return [w, s, e, n];
  }
  if (lat === undefined || lon === undefined) throw new Error("give a bbox, or lat and lon");
  const dLat = radius_km / 111.32;
  const dLon = radius_km / (111.32 * Math.max(Math.cos((lat * Math.PI) / 180), 0.01));
  return [Math.max(lon - dLon, -180), Math.max(lat - dLat, -90), Math.min(lon + dLon, 180), Math.min(lat + dLat, 90)];
}

function clipRing(ring, [w, s, e, n]) {
  const edges = [
    (p) => p[0] >= w,
    (p) => p[0] <= e,
    (p) => p[1] >= s,
    (p) => p[1] <= n,
  ];
  const cut = [
    (a, b) => [w, a[1] + ((b[1] - a[1]) * (w - a[0])) / (b[0] - a[0])],
    (a, b) => [e, a[1] + ((b[1] - a[1]) * (e - a[0])) / (b[0] - a[0])],
    (a, b) => [a[0] + ((b[0] - a[0]) * (s - a[1])) / (b[1] - a[1]), s],
    (a, b) => [a[0] + ((b[0] - a[0]) * (n - a[1])) / (b[1] - a[1]), n],
  ];
  let out = ring;
  for (let k = 0; k < 4 && out.length; k++) {
    const input = out;
    out = [];
    for (let i = 0; i < input.length; i++) {
      const cur = input[i];
      const prev = input[(i + input.length - 1) % input.length];
      const inCur = edges[k](cur);
      const inPrev = edges[k](prev);
      if (inCur) {
        if (!inPrev) out.push(cut[k](prev, cur));
        out.push(cur);
      } else if (inPrev) out.push(cut[k](prev, cur));
    }
  }
  return out;
}

function ringArea(ring, cosLat) {
  let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    a += x1 * cosLat * y2 - x2 * cosLat * y1;
  }
  return Math.abs(a) / 2;
}

const polygonsOf = (geometry) => (geometry?.type === "Polygon" ? [geometry.coordinates] : geometry?.type === "MultiPolygon" ? geometry.coordinates : []);

/**
 * Share (0 to 1) of the area [w, s, e, n] inside the footprint. Holes (inner rings) are subtracted.
 * A footprint crossing the antimeridian is treated as not covering the area.
 */
export function coverage(geometry, area) {
  const [w, s, e, n] = area;
  const cosLat = Math.cos((((s + n) / 2) * Math.PI) / 180);
  const total = (e - w) * cosLat * (n - s);
  if (total <= 0) return 0;
  let covered = 0;
  for (const rings of polygonsOf(geometry)) {
    rings.forEach((ring, i) => {
      const pts = ring.length > 1 && ring[0][0] === ring.at(-1)[0] && ring[0][1] === ring.at(-1)[1] ? ring.slice(0, -1) : ring;
      if (pts.some((p, j) => j > 0 && Math.abs(p[0] - pts[j - 1][0]) > 180)) return;
      const a = ringArea(clipRing(pts, area), cosLat);
      covered += i === 0 ? a : -a;
    });
  }
  return Math.max(0, Math.min(1, covered / total));
}
