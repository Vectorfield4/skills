#!/usr/bin/env node
// Fetches the outer boundary of the region (OSM admin_level=4) and writes
// geo/<region>/region.geojson. The map draws only this border by default.

import { existsSync } from "node:fs";
import path from "node:path";
import {
  OSM_LICENSE,
  overpass,
  polygonToGeometry,
  readJson,
  relationPolygons,
  simplifyRing,
  today,
  writeJson,
} from "#lib/geo.mjs";
import { isEntryPoint, parseFlags } from "#lib/cli.mjs";

const usage = `Usage:
  node scripts/fetch-region-outline.mjs --region leningrad-oblast --area 176095

Flags:
  --region     geo folder name (required)
  --area       OSM relation id of the region (required)
  --tolerance  simplification in degrees, default 0.002
  --out        default geo/<region>/region.geojson
  --endpoint   Overpass endpoint, default the public list`;

const main = async () => {
  const flags = parseFlags(process.argv.slice(2), {
    region: "string",
    area: "number",
    tolerance: "number",
    out: "string",
    endpoint: "string",
  });
  if (!flags.region) throw new Error("--region is required");
  if (!flags.area) throw new Error("--area is required");

  const regionDir = path.join(process.cwd(), "geo", flags.region);
  const indexFile = path.join(regionDir, "index.geojson");
  if (!existsSync(indexFile)) throw new Error(`index not found: ${indexFile}`);
  const index = readJson(indexFile);
  const tolerance = flags.tolerance ?? 0.002;

  const payload = await overpass(`[out:json][timeout:300];rel(${flags.area});out body geom;`, {
    endpoint: flags.endpoint,
  });
  const relation = payload.elements?.find((element) => element.type === "relation");
  if (!relation) throw new Error(`relation ${flags.area} not found`);

  const polygons = relationPolygons(relation.members ?? []).map((polygon) =>
    polygon.map((ring) => simplifyRing(ring, tolerance)),
  );
  if (polygons.length === 0) throw new Error("no closed rings in the region relation");

  const outFile = flags.out ? path.resolve(flags.out) : path.join(regionDir, "region.geojson");
  writeJson(outFile, {
    type: "FeatureCollection",
    name: `${index.name} — внешняя граница`,
    region: flags.region,
    source: "OpenStreetMap, boundary=administrative, admin_level=4",
    license: OSM_LICENSE,
    generated: today(),
    count: 1,
    features: [
      {
        type: "Feature",
        id: flags.region,
        geometry: polygonToGeometry(polygons),
        properties: {
          name: index.name,
          osm_relation_id: relation.id,
          osm_admin_level: 4,
          source: "OpenStreetMap, boundary=administrative",
        },
      },
    ],
  });

  process.stdout.write(
    `${JSON.stringify(
      {
        region: flags.region,
        out: path.relative(process.cwd(), outFile),
        polygons: polygons.length,
        points: polygons.reduce((sum, polygon) => sum + polygon.reduce((inner, ring) => inner + ring.length, 0), 0),
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
