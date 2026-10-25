#!/usr/bin/env node
// Rebuilds geo/<region>/index.geojson from district folders, boundaries and
// spring layers. Counts and paths must match the district files exactly.

import { existsSync } from "node:fs";
import path from "node:path";
import { bboxPolygon, readJson, round, today, writeJson } from "#lib/geo.mjs";
import { isEntryPoint, parseFlags } from "#lib/cli.mjs";

const usage = `Usage:
  node scripts/build-index.mjs --region leningrad-oblast

Flags:
  --region  geo folder name (required)
  --out     output path, default geo/<region>/index.geojson`;

const readFeatures = (file) => {
  const data = readJson(file);
  return Array.isArray(data.features) ? data.features : [];
};

const extentOf = (features) => {
  const points = features.map((feature) => feature.geometry?.coordinates).filter((coords) => Array.isArray(coords));
  if (points.length === 0) return { bbox: null, centroid: null };
  const bbox = points.reduce(
    (acc, [lon, lat]) => [Math.min(acc[0], lon), Math.min(acc[1], lat), Math.max(acc[2], lon), Math.max(acc[3], lat)],
    [Infinity, Infinity, -Infinity, -Infinity],
  );
  return {
    bbox: bbox.map((value) => round(value, 6)),
    centroid: [round((bbox[0] + bbox[2]) / 2, 6), round((bbox[1] + bbox[3]) / 2, 6)],
  };
};

const main = async () => {
  const flags = parseFlags(process.argv.slice(2), { region: "string", out: "string" });
  if (!flags.region) throw new Error("--region is required");

  const regionDir = path.join(process.cwd(), "geo", flags.region);
  const indexPath = path.join(regionDir, "index.geojson");
  const existing = existsSync(indexPath) ? readJson(indexPath) : null;
  const boundariesFile = path.join(regionDir, "boundaries.geojson");
  const boundaries = existsSync(boundariesFile) ? readJson(boundariesFile) : null;

  const existingFeatures = existing?.features ?? [];
  const boundaryBySlug = new Map((boundaries?.features ?? []).map((feature) => [feature.properties?.district_slug, feature]));
  const existingBySlug = new Map(existingFeatures.map((feature) => [feature.properties?.district_slug, feature]));

  const order = [
    ...existingFeatures.map((feature) => feature.properties?.district_slug),
    ...(boundaries?.features ?? []).map((feature) => feature.properties?.district_slug),
  ].filter((slug, index, list) => slug && list.indexOf(slug) === index);

  if (order.length === 0) throw new Error("No districts found in index.geojson or boundaries.geojson");

  const features = [];
  const missingDirs = [];

  for (const slug of order) {
    const districtDir = path.join(regionDir, slug);
    if (!existsSync(districtDir)) {
      missingDirs.push(slug);
      continue;
    }

    const old = existingBySlug.get(slug)?.properties ?? {};
    const boundary = boundaryBySlug.get(slug);
    const boundaryProps = boundary?.properties ?? {};

    const springsFile = path.join(districtDir, "springs.geojson");
    if (!existsSync(springsFile)) throw new Error(`missing springs.geojson for ${slug}`);
    const springs = readFeatures(springsFile);

    const osmFile = path.join(districtDir, "osm-springs.geojson");
    const osm = existsSync(osmFile) ? readFeatures(osmFile) : [];

    const areaFile = path.join(districtDir, "area.md");
    if (!existsSync(areaFile)) throw new Error(`missing area.md for ${slug}`);

    const { bbox, centroid } = extentOf(springs);
    const geometry = boundary?.geometry ?? (bbox ? bboxPolygon(bbox) : null);
    const geometryBasis = boundary ? "osm_admin_boundary" : "springs_extent_bbox";

    features.push({
      type: "Feature",
      id: slug,
      geometry,
      properties: {
        district: old.district ?? boundaryProps.district ?? slug,
        district_slug: slug,
        district_type: boundaryProps.district_type ?? old.district_type ?? "муниципальный район",
        admin_subject: boundaryProps.admin_subject ?? old.admin_subject ?? existing?.admin_subject ?? flags.region,
        springs_count: springs.length,
        springs_path: `${slug}/springs.geojson`,
        area_md: `${slug}/area.md`,
        geometry_basis: geometryBasis,
        bbox,
        centroid,
        osm_relation_id: boundaryProps.osm_relation_id ?? old.osm_relation_id ?? null,
        osm_springs_count: osm.length,
        osm_springs_path: osm.length > 0 ? `${slug}/osm-springs.geojson` : null,
      },
    });
  }

  if (missingDirs.length > 0) {
    throw new Error(`Missing district folders: ${missingDirs.join(", ")}. Create them with area.md and springs.geojson first.`);
  }

  const outFile = flags.out ? path.resolve(flags.out) : indexPath;
  writeJson(outFile, {
    type: "FeatureCollection",
    name: existing?.name ?? flags.region,
    region: flags.region,
    region_type: existing?.region_type ?? "регион",
    admin_subject: existing?.admin_subject ?? features[0]?.properties.admin_subject ?? flags.region,
    ...(existing?.admin_center ? { admin_center: existing.admin_center } : {}),
    generated: today(),
    description:
      existing?.description ??
      "Индекс районов: geometry — граница района из OSM (bbox, если граница не загружена), свойства — пути и счётчики.",
    count: features.length,
    features,
  });

  const report = {
    region: flags.region,
    out: path.relative(process.cwd(), outFile),
    count: features.length,
    springs: features.reduce((sum, feature) => sum + feature.properties.springs_count, 0),
    osm: features.reduce((sum, feature) => sum + feature.properties.osm_springs_count, 0),
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
};

if (isEntryPoint(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  });
}
