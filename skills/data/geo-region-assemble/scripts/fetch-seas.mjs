#!/usr/bin/env node
// Builds geo/<region>/sea.geojson: the sea around the region for the schematic map.
//
// Source: Natural Earth 1:10m Ocean, public domain. One ocean MultiPolygon covers
// every sea, and land sits inside it as holes. Rings are clipped to the region bbox
// with holes kept, so the map can draw the water with an even-odd fill.

import { existsSync } from "node:fs";
import path from "node:path";
import {
  bboxOfGeometry,
  clipGeometryToBbox,
  polygonToGeometry,
  readJson,
  simplifyRing,
  today,
  writeJson,
} from "#lib/geo.mjs";
import { fetchText } from "#lib/http.mjs";
import { isEntryPoint, parseFlags, wantsHelp } from "#lib/cli.mjs";

const DEFAULT_URL =
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_ocean.geojson";
const SOURCE = "Natural Earth 1:10m Ocean";
const LICENSE = "Public domain";
const USER_AGENT = "opencode-skills-geo/1.0 (+https://www.naturalearthdata.com)";

const usage = `Usage:
  node scripts/fetch-seas.mjs --region leningrad-oblast

Flags:
  --region     geo folder name, default leningrad-oblast
  --url        ocean GeoJSON, default Natural Earth 1:10m
  --margin     degrees of padding around the region bbox, default 0.25
  --tolerance  simplification tolerance in degrees, default 0.002
  --out        output path, default geo/<region>/sea.geojson
  --help       print this usage and exit`;

/** Union bbox of every boundary feature in the region. */
const unionBbox = (features) => {
  let box = [Infinity, Infinity, -Infinity, -Infinity];
  for (const feature of features) {
    const featureBox = feature.geometry ? bboxOfGeometry(feature.geometry) : null;
    if (!featureBox) continue;
    box = [
      Math.min(box[0], featureBox[0]),
      Math.min(box[1], featureBox[1]),
      Math.max(box[2], featureBox[2]),
      Math.max(box[3], featureBox[3]),
    ];
  }
  return Number.isFinite(box[0]) ? box : null;
};

const roundBbox = (bbox, digits = 4) => bbox.map((value) => Math.round(value * 10 ** digits) / 10 ** digits);

const main = async () => {
  if (wantsHelp(process.argv.slice(2))) {
    process.stdout.write(`${usage}\n`);
    return;
  }

  const flags = parseFlags(process.argv.slice(2), {
    region: "string",
    url: "string",
    margin: "number",
    tolerance: "number",
    out: "string",
  });

  const region = flags.region ?? "leningrad-oblast";
  const url = flags.url ?? DEFAULT_URL;
  const margin = flags.margin ?? 0.25;
  const tolerance = flags.tolerance ?? 0.002;

  const regionDir = path.join(process.cwd(), "geo", region);
  const boundsFile = path.join(regionDir, "boundaries.geojson");
  if (!existsSync(boundsFile)) throw new Error(`boundaries not found: ${boundsFile}. Run fetch-boundaries.mjs first.`);

  const boundaries = readJson(boundsFile);
  const regionBbox = unionBbox(boundaries.features ?? []);
  if (!regionBbox) throw new Error("No district geometries in boundaries.geojson");

  const bbox = roundBbox([
    regionBbox[0] - margin,
    regionBbox[1] - margin,
    regionBbox[2] + margin,
    regionBbox[3] + margin,
  ]);

  process.stderr.write(`Clipping ocean to ${bbox.join(", ")}...\n`);
  const text = await fetchText(url, { userAgent: USER_AGENT, timeoutMs: 180000 });
  const payload = JSON.parse(text);
  const oceanFeatures = payload.features ?? [];
  if (oceanFeatures.length === 0) throw new Error(`no features in ocean GeoJSON: ${url}`);

  const polygons = oceanFeatures.flatMap((feature) =>
    feature.geometry ? clipGeometryToBbox(feature.geometry, bbox).coordinates : [],
  );
  process.stderr.write(`Clipped ocean has ${polygons.length} polygon(s)\n`);

  const simplified = polygons.flatMap((rings) => {
    const outer = simplifyRing(rings[0], tolerance);
    if (outer.length < 4) return [];
    const holes = rings
      .slice(1)
      .map((hole) => simplifyRing(hole, tolerance))
      .filter((hole) => hole.length >= 4);
    return [[outer, ...holes]];
  });

  if (simplified.length === 0) {
    throw new Error(`no sea polygons survived clipping to ${bbox.join(", ")} (margin ${margin})`);
  }

  const indexFile = path.join(regionDir, "index.geojson");
  const regionName = existsSync(indexFile) ? (readJson(indexFile).name ?? region) : region;

  const outFile = flags.out ? path.resolve(flags.out) : path.join(regionDir, "sea.geojson");
  writeJson(outFile, {
    type: "FeatureCollection",
    name: `Моря: ${regionName}`,
    region,
    source: SOURCE,
    license: LICENSE,
    generated: today(),
    bbox,
    count: 1,
    features: [
      {
        type: "Feature",
        id: "baltic-sea",
        geometry: polygonToGeometry(simplified),
        properties: {
          name: "Балтийское море",
          kind: "sea",
          source: SOURCE,
          license: LICENSE,
        },
      },
    ],
  });

  const points = simplified.reduce(
    (sum, rings) => sum + rings.reduce((inner, ring) => inner + ring.length, 0),
    0,
  );

  process.stdout.write(
    `${JSON.stringify(
      {
        region,
        out: path.relative(process.cwd(), outFile),
        count: 1,
        polygons: simplified.length,
        holes: simplified.reduce((sum, rings) => sum + rings.length - 1, 0),
        points,
        bbox,
        margin,
        tolerance,
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
