#!/usr/bin/env node
// Builds geo/<region>/roads.geojson: a decorative road layer for the schematic maps.
//
// Source: OpenStreetMap ways tagged highway=*. The layer is visual only. All ways
// of a tier are merged into one MultiLineString, so a map renders a single <path>
// per tier and no per-road properties reach the page. Coordinates are simplified
// in degrees: at map widths of 880-1200 px a finer tolerance is invisible.
//
// Usage:
//   node scripts/fetch-roads.mjs --region leningrad-oblast --area 176095
//   node scripts/fetch-roads.mjs --input roads.json

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { isEntryPoint, wantsHelp } from "#lib/cli.mjs";

const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];
const USER_AGENT = "opencode-skills-geo/1.0 (+https://www.openstreetmap.org)";
const OSM_LICENSE = "ODbL 1.0, (c) OpenStreetMap contributors";

const usage = `Usage:
  node scripts/fetch-roads.mjs --region leningrad-oblast --area 176095

Flags:
  --region     geo folder name, default leningrad-oblast
  --area       OSM relation id without the 3600000000 offset, default 176095
  --major      major highway classes, default motorway|trunk|primary
  --minor      minor highway classes, default secondary
  --tolerance  simplification tolerance in degrees, default 0.0015
  --input      replay a saved Overpass response
  --out        output path, default geo/<region>/roads.geojson
  --endpoint   pin one Overpass mirror
  --help       print this usage and exit`;

if (wantsHelp(process.argv.slice(2))) {
  process.stdout.write(`${usage}\n`);
  process.exit(0);
}

const { values } = parseArgs({
  options: {
    region: { type: "string", default: "leningrad-oblast" },
    area: { type: "string", default: "176095" },
    major: { type: "string", default: "motorway|trunk|primary" },
    minor: { type: "string", default: "secondary" },
    tolerance: { type: "string", default: "0.0015" },
    input: { type: "string" },
    out: { type: "string" },
    endpoint: { type: "string" },
  },
});

const region = values.region;
const area = values.area;
const tolerance = Number(values.tolerance);
const majorClasses = values.major.split("|");
const minorClasses = values.minor.split("|");
const classes = [...majorClasses, ...minorClasses];

const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));

const round = (value) => Math.round(value * 1e5) / 1e5;

/** Douglas-Peucker on [lon, lat]; the tolerance is in degrees. */
const simplify = (points, epsilon) => {
  if (points.length <= 3) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  const squared = epsilon * epsilon;

  while (stack.length > 0) {
    const [first, last] = stack.pop();
    const [x1, y1] = points[first];
    const [x2, y2] = points[last];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const denominator = dx * dx + dy * dy;
    let farthest = -1;
    let index = -1;

    for (let i = first + 1; i < last; i += 1) {
      const [x, y] = points[i];
      let distance;
      if (denominator === 0) {
        distance = (x - x1) ** 2 + (y - y1) ** 2;
      } else {
        const t = ((x - x1) * dx + (y - y1) * dy) / denominator;
        distance = (x - (x1 + t * dx)) ** 2 + (y - (y1 + t * dy)) ** 2;
      }
      if (distance > farthest) {
        farthest = distance;
        index = i;
      }
    }

    if (farthest > squared && index > 0) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }

  return points.filter((_, index) => keep[index]);
};

const fetchPayload = async (query) => {
  const body = new URLSearchParams({ data: query }).toString();
  const endpoints = values.endpoint ? [values.endpoint] : ENDPOINTS;
  let lastError = null;

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const endpoint = endpoints[attempt % endpoints.length];
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        body,
        headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": USER_AGENT },
      });
      const text = await response.text();
      if (!response.ok || text.trimStart().startsWith("#")) throw new Error(`${response.status} ${endpoint}`);
      return JSON.parse(text);
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 3000 * (attempt + 1)));
    }
  }

  throw lastError ?? new Error("Overpass request failed");
};

const main = async () => {
  let payload;
  if (values.input) {
    if (!existsSync(values.input)) throw new Error(`input not found: ${values.input}`);
    payload = readJson(values.input);
  } else {
    const query = `[out:json][timeout:300];
area(${3600000000 + Number(area)})->.a;
(
${classes.map((item) => `  way["highway"~"^(${item})$"](area.a);`).join("\n")}
);
out tags geom;`;
    process.stderr.write(`Requesting roads for area ${area}...\n`);
    payload = await fetchPayload(query);
  }

  const elements = payload.elements ?? [];
  const retrieved = (payload.osm3s?.timestamp_osm_base ?? new Date().toISOString()).slice(0, 10);
  process.stderr.write(`Overpass payload has ${elements.length} ways\n`);

  const tiers = [
    { tier: "major", classes: majorClasses, lines: [] },
    { tier: "minor", classes: minorClasses, lines: [] },
  ];

  for (const element of elements) {
    if (element.type !== "way") continue;
    const highway = element.tags?.highway;
    const tier = tiers.find((item) => item.classes.includes(highway));
    if (!tier) continue;

    const points = (element.geometry ?? []).map((point) => [round(point.lon), round(point.lat)]);
    if (points.length < 2) continue;

    const line = simplify(points, tolerance);
    if (line.length < 2) continue;
    tier.lines.push(line);
  }

  const features = tiers.flatMap((tier) =>
    tier.lines.length === 0
      ? []
      : [
          {
            type: "Feature",
            properties: { tier: tier.tier, classes: tier.classes, lines: tier.lines.length },
            geometry: { type: "MultiLineString", coordinates: tier.lines },
          },
        ],
  );

  const outFile = values.out ? path.resolve(values.out) : path.resolve(process.cwd(), "geo", region, "roads.geojson");
  writeFileSync(
    outFile,
    `${JSON.stringify({
      type: "FeatureCollection",
      name: `Дороги: ${region}`,
      region,
      source: `OpenStreetMap, highway=${classes.join("|")}`,
      license: OSM_LICENSE,
      retrieved,
      tolerance,
      count: features.length,
      features,
    })}\n`,
  );

  const points = features.reduce(
    (sum, feature) =>
      sum + feature.geometry.coordinates.reduce((inner, line) => inner + line.length, 0),
    0,
  );

  process.stdout.write(
    `${JSON.stringify(
      {
        region,
        out: path.relative(process.cwd(), outFile),
        tiers: features.map((feature) => ({
          tier: feature.properties.tier,
          lines: feature.properties.lines,
        })),
        points,
        bytes: readFileSync(outFile).length,
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
