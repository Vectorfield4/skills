import { describe, expect, it } from "vitest";
import {
  assembleRings,
  bboxIntersects,
  bboxOfRing,
  bboxPolygon,
  clipGeometryToBbox,
  clipRingToBbox,
  pointInPolygon,
  polygonAreaKm2,
  simplifyRing,
  wayToRing,
} from "../lib/geo.mjs";

const square = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
  [0, 0],
];

describe("geo lib rings", () => {
  it("joins split segments into one closed ring", () => {
    const rings = assembleRings([
      [
        [0, 0],
        [1, 0],
        [1, 1],
      ],
      [
        [1, 1],
        [0, 1],
        [0, 0],
      ],
    ]);

    expect(rings).toHaveLength(1);
    expect(rings[0]).toHaveLength(5);
    expect(rings[0][0]).toEqual(rings[0][4]);
  });

  it("drops an unclosed tail", () => {
    const rings = assembleRings([
      [
        [0, 0],
        [1, 0],
      ],
      [
        [2, 2],
        [3, 3],
      ],
    ]);
    expect(rings).toHaveLength(0);
  });

  it("converts an Overpass way into a ring only when it closes", () => {
    const closed = wayToRing([
      { lon: 0, lat: 0 },
      { lon: 1, lat: 0 },
      { lon: 1, lat: 1 },
      { lon: 0, lat: 0 },
    ]);
    expect(closed).toHaveLength(4);

    const open = wayToRing([
      { lon: 0, lat: 0 },
      { lon: 1, lat: 0 },
      { lon: 1, lat: 1 },
    ]);
    expect(open).toBeNull();
  });
});

describe("geo lib containment", () => {
  it("respects a hole in a polygon", () => {
    const salt = [
      [[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]],
      [[1, 1], [3, 1], [3, 3], [1, 3], [1, 1]],
    ];

    expect(pointInPolygon(0.5, 0.5, salt)).toBe(true);
    expect(pointInPolygon(2, 2, salt)).toBe(false);
    expect(pointInPolygon(5, 5, salt)).toBe(false);
  });

  it("computes a plausible area at 60 degrees north", () => {
    const cell = [
      [30, 60],
      [30.01, 60],
      [30.01, 60.01],
      [30, 60.01],
      [30, 60],
    ];
    const area = polygonAreaKm2([cell]);
    expect(area).toBeGreaterThan(0.5);
    expect(area).toBeLessThan(0.75);
  });
});

describe("geo lib bbox clipping", () => {
  it("trims a ring to the bbox and keeps it closed", () => {
    const clipped = clipRingToBbox(square, [0.25, 0.25, 0.75, 0.75]);
    expect(clipped).toHaveLength(5);
    expect(clipped[0]).toEqual(clipped[4]);
    expect(bboxOfRing(clipped)).toEqual([0.25, 0.25, 0.75, 0.75]);
  });

  it("drops a ring that misses the bbox", () => {
    expect(clipRingToBbox(square, [2, 2, 3, 3])).toEqual([]);

    const geometry = clipGeometryToBbox({ type: "Polygon", coordinates: [square] }, [2, 2, 3, 3]);
    expect(geometry.type).toBe("MultiPolygon");
    expect(geometry.coordinates).toEqual([]);
  });

  it("keeps a hole as a hole after clipping", () => {
    const geometry = clipGeometryToBbox(
      {
        type: "Polygon",
        coordinates: [
          [[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]],
          [[1, 1], [3, 1], [3, 3], [1, 3], [1, 1]],
        ],
      },
      [0, 0, 2, 2],
    );

    expect(geometry.coordinates).toHaveLength(1);
    const [outer, hole] = geometry.coordinates[0];
    expect(geometry.coordinates[0]).toHaveLength(2);
    expect(bboxOfRing(outer)).toEqual([0, 0, 2, 2]);
    expect(bboxOfRing(hole)).toEqual([1, 1, 2, 2]);
    for (const ring of [outer, hole]) {
      expect(ring[0]).toEqual(ring[ring.length - 1]);
      expect(ring.length).toBeGreaterThanOrEqual(4);
    }
    expect(pointInPolygon(0.5, 0.5, geometry.coordinates[0])).toBe(true);
    expect(pointInPolygon(1.5, 1.5, geometry.coordinates[0])).toBe(false);
  });
});

describe("geo lib bbox and simplify", () => {
  it("computes a bbox and intersects correctly", () => {
    expect(bboxOfRing(square)).toEqual([0, 0, 1, 1]);
    expect(bboxIntersects([0, 0, 1, 1], [0.5, 0.5, 2, 2])).toBe(true);
    expect(bboxIntersects([0, 0, 1, 1], [2, 2, 3, 3])).toBe(false);
  });

  it("builds a closed bbox polygon", () => {
    const polygon = bboxPolygon([28, 59, 29, 60]);
    expect(polygon.type).toBe("MultiPolygon");
    const ring = polygon.coordinates[0][0];
    expect(ring).toHaveLength(5);
    expect(ring[0]).toEqual(ring[4]);
  });

  it("keeps a closed ring closed after simplification", () => {
    const ring = [];
    for (let index = 0; index <= 100; index += 1) {
      const angle = (index / 100) * Math.PI * 2;
      ring.push([Math.cos(angle) + (index % 2 === 0 ? 0.0002 : 0), Math.sin(angle)]);
    }

    const simplified = simplifyRing(ring, 0.01);
    expect(simplified.length).toBeLessThan(ring.length);
    expect(simplified.length).toBeGreaterThanOrEqual(4);
    expect(simplified[0]).toEqual(simplified[simplified.length - 1]);
  });
});
