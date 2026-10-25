#!/usr/bin/env node
// Fetches OSM spring nodes for a region, splits them by district with
// point-in-polygon and writes the region file plus per-district files.

import { existsSync, unlinkSync } from "node:fs";
import path from "node:path";
import {
  OSM_LICENSE,
  bboxOfGeometry,
  overpass,
  overpassAreaId,
  pointInGeometry,
  readJson,
  today,
  writeJson,
} from "#lib/geo.mjs";
import { isEntryPoint, parseFlags } from "#lib/cli.mjs";

const usage = `Usage:
  node scripts/fetch-osm-springs.mjs --region leningrad-oblast --area 176095

Flags:
  --region         geo folder name (required)
  --area           OSM relation id of the region (required)
  --region-name    display name when index.geojson is missing
  --admin-subject  subject name for feature properties
  --out            region-level output, default geo/<region>/osm-springs.geojson
  --endpoint       Overpass endpoint, default https://overpass-api.de/api/interpreter`;

const TAG_KEYS = [
  "drinking_water",
  "seasonal",
  "intermittent",
  "access",
  "description",
  "covered",
  "basin",
  "bottle",
  "water_characteristics",
  "ref",
  "operator",
  "opening_hours",
  "foot",
  "dog",
  "wheelchair",
];

const pickTags = (tags) => {
  const picked = {};
  for (const key of TAG_KEYS) if (tags[key] !== undefined) picked[key] = tags[key];
  return picked;
};

const main = async () => {
  const flags = parseFlags(process.argv.slice(2), {
    region: "string",
    area: "number",
    "region-name": "string",
    "admin-subject": "string",
    out: "string",
    endpoint: "string",
  });

  if (!flags.region) throw new Error("--region is required");
  if (!flags.area) throw new Error("--area is required");

  const regionDir = path.join(process.cwd(), "geo", flags.region);
  const boundsFile = path.join(regionDir, "boundaries.geojson");
  if (!existsSync(boundsFile)) throw new Error(`boundaries not found: ${boundsFile}. Run fetch-boundaries.mjs first.`);

  const index = existsSync(path.join(regionDir, "index.geojson")) ? readJson(path.join(regionDir, "index.geojson")) : null;
  const regionName = flags["region-name"] ?? index?.name;
  if (!regionName) throw new Error("--region-name is required when index.geojson is missing");
  const adminSubject = flags["admin-subject"] ?? index?.admin_subject ?? regionName;

  const indexBySlug = new Map((index?.features ?? []).map((feature) => [feature.properties?.district_slug, feature.properties ?? {}]));
  const boundaries = readJson(boundsFile);

  const districts = (boundaries.features ?? []).flatMap((feature) => {
    const geometry = feature.geometry;
    const box = geometry ? bboxOfGeometry(geometry) : null;
    if (!feature.properties?.district_slug || !geometry || !box) return [];
    const indexed = indexBySlug.get(feature.properties.district_slug) ?? {};
    return [
      {
        slug: feature.properties.district_slug,
        name: feature.properties.district,
        type: indexed.district_type ?? feature.properties.district_type ?? "муниципальный район",
        subject: indexed.admin_subject ?? feature.properties.admin_subject ?? adminSubject,
        geometry,
        box,
      },
    ];
  });
  if (districts.length === 0) throw new Error("No district geometries in boundaries.geojson");

  const query = `[out:json][timeout:300];
area(${overpassAreaId(flags.area)})->.a;
(
  node["natural"="spring"](area.a);
  node["waterway"="spring"](area.a);
);
out body;`;

  process.stderr.write(`Requesting OSM springs for area ${flags.area}...\n`);
  const payload = await overpass(query, { endpoint: flags.endpoint });
  const elements = payload.elements ?? [];
  const retrieved = (payload.osm3s?.timestamp_osm_base ?? today()).slice(0, 10);
  process.stderr.write(`Overpass returned ${elements.length} nodes\n`);

  const buckets = new Map(districts.map((district) => [district.slug, []]));
  const skipped = [];

  for (const element of elements) {
    if (element.type !== "node" || !Number.isFinite(element.lon) || !Number.isFinite(element.lat)) continue;
    const district = districts.find(
      (candidate) =>
        element.lon >= candidate.box[0] &&
        element.lon <= candidate.box[2] &&
        element.lat >= candidate.box[1] &&
        element.lat <= candidate.box[3] &&
        pointInGeometry(candidate.geometry, element.lon, element.lat),
    );
    if (!district) {
      skipped.push(element.id);
      continue;
    }

    const tags = element.tags ?? {};
    buckets.get(district.slug).push({
      type: "Feature",
      id: `osm-node-${element.id}`,
      geometry: { type: "Point", coordinates: [element.lon, element.lat] },
      properties: {
        id: `osm-node-${element.id}`,
        osm_id: element.id,
        osm_type: "node",
        name: tags.name ?? tags["name:ru"] ?? null,
        district: district.name,
        district_slug: district.slug,
        district_type: district.type,
        admin_subject: district.subject,
        tags: pickTags(tags),
        water: null,
        sanpin_2_1_4_1175_02: null,
        flags: [],
        data_completeness: "coordinates_only",
        status: "OSM: координаты из OpenStreetMap, химического анализа нет",
        source: {
          name: "OpenStreetMap",
          url: `https://www.openstreetmap.org/node/${element.id}`,
          protocol_url: null,
          retrieved,
        },
        confidence: "low",
      },
    });
  }

  const allFeatures = [];
  const counts = {};
  for (const district of districts) {
    const features = buckets.get(district.slug).sort((a, b) => a.properties.osm_id - b.properties.osm_id);
    counts[district.slug] = features.length;
    allFeatures.push(...features);

    const districtFile = path.join(regionDir, district.slug, "osm-springs.geojson");
    if (features.length > 0) {
      writeJson(districtFile, {
        type: "FeatureCollection",
        name: `${district.name} — OSM`,
        region: flags.region,
        district_slug: district.slug,
        license: OSM_LICENSE,
        generated: today(),
        count: features.length,
        features,
      });
    } else if (existsSync(districtFile)) {
      unlinkSync(districtFile);
    }
  }

  const outFile = flags.out ? path.resolve(flags.out) : path.join(regionDir, "osm-springs.geojson");
  writeJson(outFile, {
    type: "FeatureCollection",
    name: `${regionName} — слой OpenStreetMap`,
    region: flags.region,
    license: OSM_LICENSE,
    generated: today(),
    description: "Ноды natural=spring и waterway=spring в границах региона, привязка к районам по point-in-polygon.",
    count: allFeatures.length,
    features: allFeatures,
  });

  const report = {
    region: flags.region,
    area: flags.area,
    out: path.relative(process.cwd(), outFile),
    count: allFeatures.length,
    counts,
    skipped_outside_boundaries: skipped.length,
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
};

if (isEntryPoint(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  });
}
