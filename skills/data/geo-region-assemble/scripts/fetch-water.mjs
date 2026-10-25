#!/usr/bin/env node
// Builds geo/<region>/water.geojson: large lakes for the schematic map.
//
// Source: OpenStreetMap, natural=water + water=lake inside the region area.
// Relations are assembled into multipolygons, small lakes are dropped, rings
// are simplified in degrees.

import { existsSync } from "node:fs";
import path from "node:path";
import {
  OSM_LICENSE,
  bboxIntersects,
  bboxOfGeometry,
  bboxOfRing,
  overpass,
  overpassAreaId,
  pointInGeometry,
  polygonAreaKm2,
  polygonToGeometry,
  readJson,
  simplifyRing,
  today,
  wayToRing,
  writeJson,
  relationPolygons,
} from "#lib/geo.mjs";
import { isEntryPoint, parseFlags, wantsHelp } from "#lib/cli.mjs";

const usage = `Usage:
  node scripts/fetch-water.mjs --region leningrad-oblast --area 176095
  node scripts/fetch-water.mjs --region leningrad-oblast --input overpass.json

Flags:
  --region     geo folder name (required)
  --area       OSM relation id of the region, required unless --input is set
  --input      read a saved Overpass response instead of the network
  --min-area   minimum lake area in km2, default 1
  --tolerance  simplification tolerance in degrees, default 0.002
  --out        output path, default geo/<region>/water.geojson
  --endpoint   Overpass endpoint, default https://overpass-api.de/api/interpreter
  --help       print this usage and exit`;

const sampleRing = (ring, limit) => {
  if (ring.length <= limit) return ring;
  const step = ring.length / limit;
  const samples = [];
  for (let index = 0; index < limit; index += 1) samples.push(ring[Math.floor(index * step)]);
  return samples;
};

const intersectsRegion = (polygons, districts) => {
  const outerRings = polygons.map((polygon) => polygon[0]);
  const box = outerRings
    .map((ring) => bboxOfRing(ring))
    .reduce(
      (acc, ringBox) => [
        Math.min(acc[0], ringBox[0]),
        Math.min(acc[1], ringBox[1]),
        Math.max(acc[2], ringBox[2]),
        Math.max(acc[3], ringBox[3]),
      ],
      [Infinity, Infinity, -Infinity, -Infinity],
    );

  const nearby = districts.filter((district) => bboxIntersects(box, district.box));
  if (nearby.length === 0) return false;

  const samples = outerRings.flatMap((ring) => sampleRing(ring, 12));
  samples.push([(box[0] + box[2]) / 2, (box[1] + box[3]) / 2]);
  return samples.some(([lon, lat]) => nearby.some((district) => pointInGeometry(district.geometry, lon, lat)));
};

const main = async () => {
  if (wantsHelp(process.argv.slice(2))) {
    process.stdout.write(`${usage}\n`);
    return;
  }

  const flags = parseFlags(process.argv.slice(2), {
    region: "string",
    area: "number",
    input: "string",
    "min-area": "number",
    tolerance: "number",
    out: "string",
    endpoint: "string",
  });

  if (!flags.region) throw new Error("--region is required");
  if (!flags.area && !flags.input) throw new Error("--area is required unless --input is set");

  const minAreaKm2 = flags["min-area"] ?? 1;
  const tolerance = flags.tolerance ?? 0.002;
  const regionDir = path.join(process.cwd(), "geo", flags.region);
  const boundsFile = path.join(regionDir, "boundaries.geojson");
  if (!existsSync(boundsFile)) throw new Error(`boundaries not found: ${boundsFile}. Run fetch-boundaries.mjs first.`);

  const boundaries = readJson(boundsFile);
  const districts = (boundaries.features ?? []).flatMap((feature) => {
    const geometry = feature.geometry;
    const box = geometry ? bboxOfGeometry(geometry) : null;
    return geometry && box ? [{ slug: feature.properties?.district_slug ?? null, geometry, box }] : [];
  });
  if (districts.length === 0) throw new Error("No district geometries in boundaries.geojson");

  let payload;
  if (flags.input) {
    if (!existsSync(flags.input)) throw new Error(`input not found: ${flags.input}`);
    payload = readJson(flags.input);
  } else {
    const query = `[out:json][timeout:300];
area(${overpassAreaId(flags.area)})->.a;
(
  way["natural"="water"]["water"="lake"](area.a);
  relation["natural"="water"]["water"="lake"](area.a);
);
out body geom;`;
    process.stderr.write(`Requesting lakes for area ${flags.area}...\n`);
    payload = await overpass(query, { endpoint: flags.endpoint });
  }

  const elements = payload.elements ?? [];
  const retrieved = (payload.osm3s?.timestamp_osm_base ?? today()).slice(0, 10);
  process.stderr.write(`Overpass payload has ${elements.length} elements\n`);

  const relationMemberWays = new Set();
  for (const element of elements) {
    if (element.type !== "relation") continue;
    for (const member of element.members ?? []) if (member.type === "way") relationMemberWays.add(member.ref);
  }

  const lakes = [];
  for (const element of elements) {
    const tags = element.tags ?? {};
    const polygons = [];

    if (element.type === "way") {
      if (relationMemberWays.has(element.id)) continue;
      const ring = wayToRing(element.geometry);
      if (ring) polygons.push([ring]);
    } else if (element.type === "relation") {
      polygons.push(...relationPolygons(element.members ?? []));
    }

    if (polygons.length === 0) continue;
    const areaKm2 = polygons.reduce((sum, polygon) => sum + polygonAreaKm2(polygon), 0);
    if (areaKm2 < minAreaKm2) continue;
    if (!intersectsRegion(polygons, districts)) continue;

    const simplified = polygons.flatMap((polygon) => {
      const outer = simplifyRing(polygon[0], tolerance);
      if (outer.length < 4) return [];
      const holes = polygon
        .slice(1)
        .map((hole) => simplifyRing(hole, tolerance))
        .filter((hole) => hole.length >= 4);
      return [[outer, ...holes]];
    });
    if (simplified.length === 0) continue;

    lakes.push({
      name: tags.name ?? tags["name:ru"] ?? null,
      osmId: element.id,
      osmType: element.type,
      areaKm2,
      geometry: polygonToGeometry(simplified),
    });
  }

  lakes.sort((a, b) => b.areaKm2 - a.areaKm2);

  const features = lakes.map((lake) => ({
    type: "Feature",
    properties: {
      name: lake.name,
      osm_id: lake.osmId,
      osm_type: lake.osmType,
      area_km2: Math.round(lake.areaKm2 * 10) / 10,
    },
    geometry: lake.geometry,
  }));

  const outFile = flags.out ? path.resolve(flags.out) : path.join(regionDir, "water.geojson");
  writeJson(outFile, {
    type: "FeatureCollection",
    name: `Озёра: ${flags.region}`,
    source: `OpenStreetMap, natural=water + water=lake${flags.area ? `, area ${flags.area}` : ""}`,
    license: OSM_LICENSE,
    retrieved,
    min_area_km2: minAreaKm2,
    count: features.length,
    features,
  });

  const points = features.reduce(
    (sum, feature) =>
      sum +
      feature.geometry.coordinates.reduce(
        (inner, polygon) => inner + polygon.reduce((ringSum, ring) => ringSum + ring.length, 0),
        0,
      ),
    0,
  );

  process.stdout.write(
    `${JSON.stringify(
      {
        region: flags.region,
        out: path.relative(process.cwd(), outFile),
        count: features.length,
        min_area_km2: minAreaKm2,
        points,
      },
      null,
      2,
    )}\n`,
  );
};

if (isEntryPoint(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  });
}
