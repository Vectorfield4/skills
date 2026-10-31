// Shared geo helpers for the geo skills: OSM/Overpass access, GeoJSON rings,
// point-in-polygon tests, area, simplification and file IO.
//
// No dependencies beyond node:fs and #lib/http.mjs.

import { fetchText } from "#lib/http.mjs";
import { jsonText, readJson as readJsonFile, writeJsonFile } from "#lib/json.mjs";

export const OVERPASS_ENDPOINT = "https://overpass-api.de/api/interpreter";
export const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.openstreetmap.fr/api/interpreter",
];
export const OSM_LICENSE = "ODbL 1.0, © OpenStreetMap contributors";
export const OSM_SOURCE = "OpenStreetMap, boundary=administrative";

const EPS = 1e-7;

export const readJson = readJsonFile;

/**
 * Writes JSON with a trailing newline. `indent` is opt-in: without it the file
 * stays one line, which is what the geo skill pushes to Overpass and what other
 * callers already diff against. Pass `{ indent: 2 }` for data that lives in a
 * repository, so a one-field change shows as one line in the diff.
 */
export const writeJson = (file, value, { indent } = {}) =>
  writeJsonFile(file, jsonText(value, indent === undefined ? { indent: null } : { indent }));

export const today = () => new Date().toISOString().slice(0, 10);

export const overpassAreaId = (relationId) => 3600000000 + Number(relationId);

export const round = (value, digits = 5) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

export const roundRing = (ring, digits = 5) => ring.map(([lon, lat]) => [round(lon, digits), round(lat, digits)]);

/** POSTs an Overpass QL query and returns parsed JSON. Retries overloaded mirrors. */
export async function overpass(
  query,
  { endpoints = OVERPASS_ENDPOINTS, endpoint, timeoutMs = 300000, userAgent = "opencode-skills-geo/1.0" } = {},
) {
  const body = new URLSearchParams({ data: query }).toString();
  const urls = endpoint ? [endpoint] : endpoints;
  let lastError = null;

  for (const url of urls) {
    try {
      const text = await fetchText(url, { method: "POST", body, timeoutMs, userAgent });
      return JSON.parse(text);
    } catch (error) {
      lastError = error;
      const status = Number(/^(\d{3})\b/.exec(error.message)?.[1] ?? 0);
      const retryable = status === 0 || [429, 502, 503, 504].includes(status);
      if (!retryable) break;
      await new Promise((resolve) => setTimeout(resolve, 1200));
    }
  }

  throw lastError ?? new Error("Overpass request failed");
}

export const near = (a, b) => Math.abs(a[0] - b[0]) < EPS && Math.abs(a[1] - b[1]) < EPS;

export const isClosed = (ring) => ring.length > 3 && near(ring[0], ring[ring.length - 1]);

const closeRing = (ring) => {
  const closed = ring.map(([lon, lat]) => [lon, lat]);
  closed[closed.length - 1] = [closed[0][0], closed[0][1]];
  return closed;
};

/** Joins Overpass way segments into closed rings. Unclosed tails are dropped. */
export function assembleRings(segments) {
  const pending = segments.filter((segment) => Array.isArray(segment) && segment.length >= 2);
  const rings = [];

  while (pending.length > 0) {
    const ring = pending.shift().map(([lon, lat]) => [lon, lat]);
    let joined = true;

    while (!isClosed(ring) && joined) {
      joined = false;
      for (let index = 0; index < pending.length; index += 1) {
        const segment = pending[index];
        const tail = ring[ring.length - 1];

        if (near(tail, segment[0])) {
          ring.push(...segment.slice(1));
        } else if (near(tail, segment[segment.length - 1])) {
          ring.push(...segment.slice(0, -1).reverse());
        } else {
          continue;
        }

        pending.splice(index, 1);
        joined = true;
        break;
      }
    }

    if (isClosed(ring)) rings.push(closeRing(ring));
  }

  return rings;
}

/** Converts an Overpass `out geom` way into a closed ring when possible. */
export function wayToRing(geometry) {
  if (!Array.isArray(geometry) || geometry.length < 3) return null;
  const ring = geometry.map(({ lon, lat }) => [lon, lat]);
  if (!near(ring[0], ring[ring.length - 1])) return null;
  return closeRing(ring);
}

export const bboxOfRing = (ring) => {
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;
  for (const [lon, lat] of ring) {
    if (lon < minLon) minLon = lon;
    if (lat < minLat) minLat = lat;
    if (lon > maxLon) maxLon = lon;
    if (lat > maxLat) maxLat = lat;
  }
  return [minLon, minLat, maxLon, maxLat];
};

export const bboxIntersects = (a, b) => a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];

/** Even-odd crossing test. Apply to every ring of a polygon to respect holes. */
export function pointInRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function pointInPolygon(lon, lat, rings) {
  let inside = false;
  for (const ring of rings) if (pointInRing(lon, lat, ring)) inside = !inside;
  return inside;
}

export function pointInGeometry(geometry, lon, lat) {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.type === "MultiPolygon" ? geometry.coordinates : [];
  return polygons.some((rings) => pointInPolygon(lon, lat, rings));
}

export function bboxOfGeometry(geometry) {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.type === "MultiPolygon" ? geometry.coordinates : [];
  let box = [Infinity, Infinity, -Infinity, -Infinity];
  for (const rings of polygons) {
    for (const ring of rings) {
      const ringBox = bboxOfRing(ring);
      box = [
        Math.min(box[0], ringBox[0]),
        Math.min(box[1], ringBox[1]),
        Math.max(box[2], ringBox[2]),
        Math.max(box[3], ringBox[3]),
      ];
    }
  }
  return Number.isFinite(box[0]) ? box : null;
}

/** Builds polygon rings from an Overpass relation, assigning inner rings to outers. */
export function relationPolygons(members) {
  const outerSegments = [];
  const innerSegments = [];

  for (const member of members ?? []) {
    if (member.type !== "way" || !member.geometry) continue;
    const segment = member.geometry.map(({ lon, lat }) => [lon, lat]);
    if (member.role === "inner") innerSegments.push(segment);
    else outerSegments.push(segment);
  }

  const polygons = assembleRings(outerSegments).map((ring) => [ring]);
  for (const hole of assembleRings(innerSegments)) {
    const [holeLon, holeLat] = hole[0];
    const target = polygons.find((rings) => {
      const box = bboxOfRing(rings[0]);
      return holeLon >= box[0] && holeLon <= box[2] && holeLat >= box[1] && holeLat <= box[3] && pointInPolygon(holeLon, holeLat, rings);
    });
    if (target) target.push(hole);
  }

  return polygons;
}

export function ringAreaKm2(ring) {
  let twiceArea = 0;
  let latSum = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    twiceArea += x1 * y2 - x2 * y1;
    latSum += y1;
  }
  const meanLat = latSum / ring.length;
  const metersPerDegreeLat = 111132.92;
  const metersPerDegreeLon = 111412.84 * Math.cos((meanLat * Math.PI) / 180);
  return (Math.abs(twiceArea / 2) * metersPerDegreeLat * metersPerDegreeLon) / 1e6;
}

export function polygonAreaKm2(polygon) {
  const [outer, ...holes] = polygon;
  return ringAreaKm2(outer) - holes.reduce((sum, hole) => sum + ringAreaKm2(hole), 0);
}

const simplify = (points, epsilon) => {
  if (points.length <= 4) return points;
  const sqEpsilon = epsilon * epsilon;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];

  while (stack.length > 0) {
    const [first, last] = stack.pop();
    const [x1, y1] = points[first];
    const [x2, y2] = points[last];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const denominator = dx * dx + dy * dy;
    let maxDistance = 0;
    let index = -1;

    for (let i = first + 1; i < last; i += 1) {
      const [x, y] = points[i];
      const t = denominator === 0 ? 0 : ((x - x1) * dx + (y - y1) * dy) / denominator;
      const distance = (x - (x1 + t * dx)) ** 2 + (y - (y1 + t * dy)) ** 2;
      if (distance > maxDistance) {
        maxDistance = distance;
        index = i;
      }
    }

    if (maxDistance > sqEpsilon && index > 0) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }

  return points.filter((_, index) => keep[index]);
};

/** Douglas-Peucker for closed rings, split at a far point so the baseline is real. */
export function simplifyRing(points, epsilon) {
  if (points.length <= 4) return points;
  const [firstLon, firstLat] = points[0];
  const [lastLon, lastLat] = points[points.length - 1];
  if (Math.hypot(firstLon - lastLon, firstLat - lastLat) >= 1e-9) return simplify(points, epsilon);

  let split = 0;
  let maxDistance = -1;
  for (let i = 1; i < points.length; i += 1) {
    const distance = (points[i][0] - firstLon) ** 2 + (points[i][1] - firstLat) ** 2;
    if (distance > maxDistance) {
      maxDistance = distance;
      split = i;
    }
  }

  const head = simplify(points.slice(0, split + 1), epsilon);
  const tail = simplify(points.slice(split), epsilon);
  const result = head.concat(tail.slice(1));
  // Simplification can leave a sub-machine-epsilon gap at the seam.
  result[result.length - 1] = [result[0][0], result[0][1]];
  return result;
}

export const polygonToGeometry = (polygons) => ({
  type: "MultiPolygon",
  coordinates: polygons.map((rings) => rings.map((ring) => roundRing(ring))),
});

/** Rectangle polygon for a bbox, used when a district has no OSM boundary. */
export function bboxPolygon(bbox) {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  return {
    type: "MultiPolygon",
    coordinates: [
      [
        [
          [minLon, minLat],
          [maxLon, minLat],
          [maxLon, maxLat],
          [minLon, maxLat],
          [minLon, minLat],
        ],
      ],
    ],
  };
}

const dedupeRing = (points) => {
  const unique = [];
  for (const point of points) {
    const last = unique[unique.length - 1];
    if (!last || !near(last, point)) unique.push(point);
  }
  return unique;
};

const twiceArea = (points) => {
  let sum = 0;
  for (let index = 0; index < points.length; index += 1) {
    const [x1, y1] = points[index];
    const [x2, y2] = points[(index + 1) % points.length];
    sum += x1 * y2 - x2 * y1;
  }
  return sum;
};

/** One Sutherland-Hodgman pass: keeps the part of an open ring inside a half-plane. */
const clipHalfPlane = (points, inside, intersect) => {
  const out = [];
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const previous = points[(index + points.length - 1) % points.length];
    const currentInside = inside(current);
    const previousInside = inside(previous);
    if (currentInside) {
      if (!previousInside) out.push(intersect(previous, current));
      out.push(current);
    } else if (previousInside) {
      out.push(intersect(previous, current));
    }
  }
  return out;
};

const bboxClipEdges = ([minLon, minLat, maxLon, maxLat]) => [
  [
    ([lon]) => lon >= minLon,
    ([x1, y1], [x2, y2]) => [minLon, y1 + ((minLon - x1) / (x2 - x1)) * (y2 - y1)],
  ],
  [
    ([lon]) => lon <= maxLon,
    ([x1, y1], [x2, y2]) => [maxLon, y1 + ((maxLon - x1) / (x2 - x1)) * (y2 - y1)],
  ],
  [
    ([, lat]) => lat >= minLat,
    ([x1, y1], [x2, y2]) => [x1 + ((minLat - y1) / (y2 - y1)) * (x2 - x1), minLat],
  ],
  [
    ([, lat]) => lat <= maxLat,
    ([x1, y1], [x2, y2]) => [x1 + ((maxLat - y1) / (y2 - y1)) * (x2 - x1), maxLat],
  ],
];

/**
 * Clips one ring to a bbox with Sutherland-Hodgman. The bbox is convex, so the
 * result stays a single ring, closed the way GeoJSON expects. A ring that ends up
 * empty, with fewer than four coordinates or with no surface returns `[]`.
 */
export function clipRingToBbox(ring, bbox) {
  if (!Array.isArray(ring) || ring.length < 3) return [];

  let points = dedupeRing(isClosed(ring) ? ring.slice(0, -1) : ring);
  if (points.length > 1 && near(points[0], points[points.length - 1])) points.pop();
  if (points.length < 3) return [];

  for (const [inside, intersect] of bboxClipEdges(bbox)) {
    points = clipHalfPlane(points, inside, intersect);
    if (points.length < 3) return [];
  }

  points = dedupeRing(points);
  if (points.length > 1 && near(points[0], points[points.length - 1])) points.pop();
  if (points.length < 3) return [];
  // A ring that only grazes an edge is a line with no fill: drop it.
  if (Math.abs(twiceArea(points)) < EPS) return [];

  return [...points, [points[0][0], points[0][1]]];
}

/**
 * Clips a Polygon or MultiPolygon to a bbox. Outer rings and holes are clipped
 * separately, so a hole (an island inside the ocean) survives as a hole. Rings
 * whose bbox misses the clip box are dropped before the geometry work.
 */
export function clipGeometryToBbox(geometry, bbox) {
  const polygons =
    geometry?.type === "Polygon" ? [geometry.coordinates] : geometry?.type === "MultiPolygon" ? geometry.coordinates : [];
  const coordinates = [];
  const intersects = (ring) => {
    const ringBox = bboxOfRing(ring);
    return Number.isFinite(ringBox[0]) && bboxIntersects(ringBox, bbox);
  };

  for (const rings of polygons) {
    if (!Array.isArray(rings) || rings.length === 0) continue;
    if (!Array.isArray(rings[0]) || rings[0].length < 3) continue;
    if (!intersects(rings[0])) continue;

    const outer = clipRingToBbox(rings[0], bbox);
    if (outer.length < 4) continue;

    const holes = rings
      .slice(1)
      .filter((ring) => Array.isArray(ring) && ring.length >= 3 && intersects(ring))
      .map((ring) => clipRingToBbox(ring, bbox))
      .filter((hole) => hole.length >= 4);

    coordinates.push([outer, ...holes]);
  }

  return { type: "MultiPolygon", coordinates };
}
