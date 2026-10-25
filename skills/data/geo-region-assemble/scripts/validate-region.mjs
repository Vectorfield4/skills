#!/usr/bin/env node
// Validates a geo region against the contracts in references/formats.md.
// Read-only. Prints a JSON report and exits 1 when errors are found.

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { bboxOfRing, readJson, today, writeJson } from "#lib/geo.mjs";
import { isEntryPoint, parseFlags } from "#lib/cli.mjs";

const usage = `Usage:
  node scripts/validate-region.mjs --region leningrad-oblast

Flags:
  --region  geo folder name (required)
  --out     write the JSON report to this file`;

const DISTANCE = ["муниципальный район", "муниципальный округ", "городской район", "городской округ"];

const isFiniteNumber = (value) => typeof value === "number" && Number.isFinite(value);
const isDate = (value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
const isBbox = (value) => Array.isArray(value) && value.length === 4 && value.every(isFiniteNumber);
const isPoint = (value) => Array.isArray(value) && value.length === 2 && value.every(isFiniteNumber);
const ringIsClosed = (ring) =>
  Array.isArray(ring) && ring.length >= 4 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1];

const collectionBbox = (features) => {
  let box = [Infinity, Infinity, -Infinity, -Infinity];
  for (const feature of features) {
    const geometry = feature.geometry;
    if (!geometry) continue;
    const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.type === "MultiPolygon" ? geometry.coordinates : [];
    for (const rings of polygons) {
      const ringBox = bboxOfRing(rings[0] ?? []);
      if (!Number.isFinite(ringBox[0])) continue;
      box = [
        Math.min(box[0], ringBox[0]),
        Math.min(box[1], ringBox[1]),
        Math.max(box[2], ringBox[2]),
        Math.max(box[3], ringBox[3]),
      ];
    }
  }
  return Number.isFinite(box[0]) ? box : null;
};

const main = async () => {
  const flags = parseFlags(process.argv.slice(2), { region: "string", out: "string" });
  if (!flags.region) throw new Error("--region is required");

  const regionDir = path.join(process.cwd(), "geo", flags.region);
  const errors = [];
  const warnings = [];
  const error = (message) => errors.push(message);
  const warn = (message) => warnings.push(message);

  const readCollection = (file, label) => {
    if (!existsSync(file)) {
      error(`${label}: file not found: ${path.relative(process.cwd(), file)}`);
      return null;
    }
    try {
      const data = readJson(file);
      if (data.type !== "FeatureCollection" || !Array.isArray(data.features)) {
        error(`${label}: not a FeatureCollection`);
        return null;
      }
      return data;
    } catch (parseError) {
      error(`${label}: invalid JSON: ${parseError.message}`);
      return null;
    }
  };

  if (!existsSync(regionDir)) throw new Error(`region folder not found: ${regionDir}`);
  const regionArea = path.join(regionDir, "area.md");
  if (!existsSync(regionArea) || readFileSync(regionArea, "utf8").trim().length < 50) error("region area.md is missing or too short");

  const index = readCollection(path.join(regionDir, "index.geojson"), "index.geojson");
  const boundaries = readCollection(path.join(regionDir, "boundaries.geojson"), "boundaries.geojson");
  const regionOsm = existsSync(path.join(regionDir, "osm-springs.geojson"))
    ? readCollection(path.join(regionDir, "osm-springs.geojson"), "osm-springs.geojson")
    : null;
  const outline = existsSync(path.join(regionDir, "region.geojson"))
    ? readCollection(path.join(regionDir, "region.geojson"), "region.geojson")
    : null;
  if (!outline) warn("region.geojson is missing; the map will render without the outer border");
  const water = existsSync(path.join(regionDir, "water.geojson"))
    ? readCollection(path.join(regionDir, "water.geojson"), "water.geojson")
    : null;
  if (!water) warn("water.geojson is missing; the map will render without lakes");
  const sea = existsSync(path.join(regionDir, "sea.geojson"))
    ? readCollection(path.join(regionDir, "sea.geojson"), "sea.geojson")
    : null;
  if (!sea) warn("sea.geojson is missing; the map will render without the sea");

  let regionBox = boundaries ? collectionBbox(boundaries.features) : null;
  if (regionBox) regionBox = [regionBox[0] - 1, regionBox[1] - 1, regionBox[2] + 1, regionBox[3] + 1];

  const indexSlugs = new Set();

  if (index) {
    if (index.region !== flags.region) error(`index.geojson: region is ${index.region}, expected ${flags.region}`);
    if (index.count !== index.features.length) error("index.geojson: count does not match features.length");

    const center = index.admin_center;
    if (center !== undefined && center !== null) {
      const where = "index.geojson admin_center";
      if (typeof center !== "object" || Array.isArray(center)) {
        error(`${where}: must be an object`);
      } else {
        if (typeof center.name !== "string" || center.name.trim().length === 0) {
          error(`${where}: name must be a non-empty string`);
        }
        if (!isFiniteNumber(center.lon) || !isFiniteNumber(center.lat)) {
          error(`${where}: lon and lat must be finite numbers`);
        }
        if (center.osm_id !== undefined && center.osm_id !== null && !isFiniteNumber(center.osm_id)) {
          error(`${where}: osm_id must be a number when present`);
        }
        if (
          center.osm_type !== undefined &&
          center.osm_type !== null &&
          !["node", "way", "relation"].includes(center.osm_type)
        ) {
          warn(`${where}: unusual osm_type "${center.osm_type}"`);
        }
        if (typeof center.source !== "string" || center.source.trim().length === 0) {
          warn(`${where}: source is empty, attribution is expected`);
        }
      }
    }

    for (const feature of index.features) {
      const props = feature.properties ?? {};
      const slug = props.district_slug;
      const where = `index.geojson ${slug ?? "<no slug>"}`;

      if (!slug) {
        error(`${where}: district_slug is required`);
        continue;
      }
      if (indexSlugs.has(slug)) error(`${where}: duplicate district_slug`);
      indexSlugs.add(slug);

      for (const key of ["district", "district_slug", "district_type", "admin_subject", "springs_path", "area_md", "geometry_basis"]) {
        if (typeof props[key] !== "string" || props[key].length === 0) error(`${where}: ${key} must be a non-empty string`);
      }
      if (!DISTANCE.includes(props.district_type)) warn(`${where}: unusual district_type "${props.district_type}"`);
      if (!["osm_admin_boundary", "springs_extent_bbox"].includes(props.geometry_basis)) {
        error(`${where}: geometry_basis must be osm_admin_boundary or springs_extent_bbox`);
      }
      if (props.bbox !== null && !isBbox(props.bbox)) error(`${where}: bbox must be [minLon,minLat,maxLon,maxLat] or null`);
      if (props.centroid !== null && !isPoint(props.centroid)) error(`${where}: centroid must be [lon,lat] or null`);
      if (!isFiniteNumber(props.springs_count) || props.springs_count < 0) error(`${where}: springs_count must be a number`);
      if (!isFiniteNumber(props.osm_springs_count) || props.osm_springs_count < 0) {
        error(`${where}: osm_springs_count must be a number`);
      }
      if (props.osm_relation_id !== null && props.osm_relation_id !== undefined && !isFiniteNumber(props.osm_relation_id)) {
        error(`${where}: osm_relation_id must be a number, null or omitted`);
      }
      if (props.geometry_basis === "osm_admin_boundary" && !feature.geometry) error(`${where}: geometry is required for osm_admin_boundary`);
      if (feature.geometry && !["Polygon", "MultiPolygon"].includes(feature.geometry.type)) {
        error(`${where}: geometry must be Polygon or MultiPolygon`);
      }

      const districtDir = path.join(regionDir, slug);
      if (!existsSync(districtDir)) {
        error(`${where}: district folder is missing`);
        continue;
      }
      if (!existsSync(path.join(regionDir, props.area_md))) error(`${where}: area_md does not exist`);
      const districtArea = path.join(regionDir, props.area_md);
      if (existsSync(districtArea) && readFileSync(districtArea, "utf8").trim().length < 50) warn(`${where}: area.md is short`);

      const springsFile = path.join(regionDir, props.springs_path);
      if (!existsSync(springsFile)) {
        error(`${where}: springs_path does not exist`);
        continue;
      }
      const springs = readCollection(springsFile, `${slug}/springs.geojson`);
      if (springs) {
        if (springs.count !== springs.features.length) error(`${where}: springs count mismatch`);
        if (springs.count !== props.springs_count) error(`${where}: index springs_count does not match the file`);
      }

      const osmCount = props.osm_springs_count;
      if (osmCount > 0) {
        if (!props.osm_springs_path) error(`${where}: osm_springs_path is required when count > 0`);
        else if (!existsSync(path.join(regionDir, props.osm_springs_path))) error(`${where}: osm_springs_path does not exist`);
      } else if (props.osm_springs_path !== null) {
        error(`${where}: osm_springs_path must be null when count is 0`);
      }
    }
  }

  const checkPoint = (where, coordinates) => {
    if (!isPoint(coordinates)) {
      error(`${where}: coordinates must be [lon,lat]`);
      return;
    }
    const [lon, lat] = coordinates;
    if (regionBox && (lon < regionBox[0] || lon > regionBox[2] || lat < regionBox[1] || lat > regionBox[3])) {
      error(`${where}: coordinates fall outside the region bounds`);
    }
  };

  if (index && indexSlugs.size > 0) {
    for (const slug of indexSlugs) {
      const springsFile = path.join(regionDir, slug, "springs.geojson");
      if (!existsSync(springsFile)) continue;
      let data;
      try {
        data = readJson(springsFile);
      } catch (parseError) {
        error(`${slug}/springs.geojson: invalid JSON: ${parseError.message}`);
        continue;
      }
      const ids = new Set();
      for (const feature of data.features ?? []) {
        const props = feature.properties ?? {};
        const where = `${slug}/springs.geojson ${props.id ?? "<no id>"}`;
        if (ids.has(props.id)) error(`${where}: duplicate id`);
        ids.add(props.id);
        if (!props.id) error(`${where}: id is required`);
        if (!props.name) warn(`${where}: name is empty`);
        if (props.region !== flags.region) error(`${where}: region is ${props.region}`);
        if (props.district_slug !== slug) error(`${where}: district_slug is ${props.district_slug}`);
        if (!["coordinates+chemistry", "coordinates_only"].includes(props.data_completeness)) {
          error(`${where}: bad data_completeness`);
        }
        if (!["high", "medium", "low"].includes(props.confidence)) error(`${where}: bad confidence`);
        if (!Array.isArray(props.flags)) error(`${where}: flags must be an array`);
        if (props.sanpin_2_1_4_1175_02 !== null && typeof props.sanpin_2_1_4_1175_02 !== "string") {
          error(`${where}: sanpin must be a string or null`);
        }
        if (!props.source?.url) error(`${where}: source.url is required`);
        if (props.source?.retrieved && !isDate(props.source.retrieved)) warn(`${where}: source.retrieved is not YYYY-MM-DD`);

        if (props.data_completeness === "coordinates+chemistry") {
          if (!props.water || typeof props.water !== "object") error(`${where}: water is required for chemistry points`);
          else {
            for (const key of ["mineralization_mg_l", "hardness_deg_g", "ph", "nitrates_mg_l", "chlorides_mg_l"]) {
              if (props.water[key] !== null && !isFiniteNumber(props.water[key])) error(`${where}: water.${key} must be a number or null`);
            }
            if (!props.water.class || typeof props.water.class !== "object") error(`${where}: water.class is required`);
          }
        } else if (props.water !== null) {
          const water = props.water;
          const values = water && typeof water === "object" ? Object.values(water).flatMap((value) => (value && typeof value === "object" ? Object.values(value) : [value])) : [];
          if (typeof water !== "object" || values.some((value) => value !== null)) {
            error(`${where}: water must be null or an all-null object for coordinates_only`);
          }
        }

        checkPoint(where, feature.geometry?.coordinates);
      }
    }
  }

  if (indexSlugs.size > 0) {
    for (const slug of indexSlugs) {
      const osmFile = path.join(regionDir, slug, "osm-springs.geojson");
      if (!existsSync(osmFile)) continue;
      let data;
      try {
        data = readJson(osmFile);
      } catch (parseError) {
        error(`${slug}/osm-springs.geojson: invalid JSON: ${parseError.message}`);
        continue;
      }
      if (data.count !== (data.features ?? []).length) error(`${slug}/osm-springs.geojson: count mismatch`);
      const ids = new Set();
      for (const feature of data.features ?? []) {
        const props = feature.properties ?? {};
        const where = `${slug}/osm-springs.geojson ${props.id ?? "<no id>"}`;
        if (ids.has(props.osm_id)) error(`${where}: duplicate osm_id`);
        ids.add(props.osm_id);
        if (props.id !== `osm-node-${props.osm_id}`) error(`${where}: id must be osm-node-<osm_id>`);
        if (props.osm_type !== "node") error(`${where}: osm_type must be node`);
        if (props.water !== null) error(`${where}: water must be null`);
        if (props.data_completeness !== "coordinates_only") error(`${where}: data_completeness must be coordinates_only`);
        if (props.confidence !== "low") error(`${where}: confidence must be low`);
        if (props.district_slug !== slug) error(`${where}: district_slug is ${props.district_slug}`);
        if (props.source?.url !== `https://www.openstreetmap.org/node/${props.osm_id}`) error(`${where}: source.url mismatch`);
        if (!props.tags || typeof props.tags !== "object") error(`${where}: tags must be an object`);
        checkPoint(where, feature.geometry?.coordinates);
      }
    }
  }

  if (outline) {
    if (outline.count !== 1 || outline.features.length !== 1) error("region.geojson must have exactly one feature");
    if (!String(outline.license ?? "").includes("ODbL")) error("region.geojson: license must mention ODbL");
    const feature = outline.features[0];
    if (feature?.geometry?.type !== "MultiPolygon") error("region.geojson: geometry must be MultiPolygon");
    for (const polygon of feature?.geometry?.coordinates ?? []) {
      for (const ring of polygon) if (!ringIsClosed(ring)) error("region.geojson: ring is not closed");
    }
  }

  if (boundaries) {
    if (boundaries.count !== boundaries.features.length) error("boundaries.geojson: count mismatch");
    if (!String(boundaries.license ?? "").includes("ODbL")) error("boundaries.geojson: license must mention ODbL");    const slugs = new Set();
    for (const feature of boundaries.features) {
      const props = feature.properties ?? {};
      const where = `boundaries.geojson ${props.district_slug ?? "<no slug>"}`;
      if (!props.district_slug) error(`${where}: district_slug is required`);
      if (slugs.has(props.district_slug)) error(`${where}: duplicate district_slug`);
      slugs.add(props.district_slug);
      if (feature.id !== props.district_slug) warn(`${where}: feature.id differs from district_slug`);
      if (props.osm_admin_level !== 6) error(`${where}: osm_admin_level must be 6`);
      if (feature.geometry?.type !== "MultiPolygon") error(`${where}: geometry must be MultiPolygon`);
      for (const polygon of feature.geometry?.coordinates ?? []) {
        for (const ring of polygon) if (!ringIsClosed(ring)) error(`${where}: ring is not closed`);
      }
    }
    for (const slug of indexSlugs) {
      if (!slugs.has(slug)) warn(`index district ${slug} has no boundary feature`);
    }
  }

  if (water) {
    if (water.count !== water.features.length) error("water.geojson: count mismatch");
    if (!String(water.license ?? "").includes("ODbL")) error("water.geojson: license must mention ODbL");
    if (!isFiniteNumber(water.min_area_km2)) error("water.geojson: min_area_km2 is required");
    const ids = new Set();
    for (const feature of water.features) {
      const props = feature.properties ?? {};
      const where = `water.geojson ${props.osm_id ?? "<no id>"}`;
      if (ids.has(props.osm_id)) error(`${where}: duplicate osm_id`);
      ids.add(props.osm_id);
      if (!isFiniteNumber(props.area_km2) || props.area_km2 <= 0) error(`${where}: area_km2 must be positive`);
      if (isFiniteNumber(water.min_area_km2) && props.area_km2 < water.min_area_km2) warn(`${where}: area is below min_area_km2`);
      if (props.name !== null && typeof props.name !== "string") error(`${where}: name must be a string or null`);
      if (feature.geometry?.type !== "MultiPolygon") error(`${where}: geometry must be MultiPolygon`);
      for (const polygon of feature.geometry?.coordinates ?? []) {
        for (const ring of polygon) if (!ringIsClosed(ring)) error(`${where}: ring is not closed`);
      }
    }
  }

  if (sea) {
    if (sea.count !== sea.features.length) error("sea.geojson: count mismatch");
    if (!String(sea.license ?? "").includes("Public domain")) error("sea.geojson: license must be Public domain");
    for (const feature of sea.features) {
      const props = feature.properties ?? {};
      const where = `sea.geojson ${feature.id ?? props.name ?? "<no id>"}`;
      if (typeof props.name !== "string" || props.name.trim().length === 0) error(`${where}: name is required`);
      if (props.kind !== "sea") error(`${where}: kind must be sea`);
      if (feature.geometry?.type !== "MultiPolygon") error(`${where}: geometry must be MultiPolygon`);
      for (const polygon of feature.geometry?.coordinates ?? []) {
        for (const ring of polygon) if (!ringIsClosed(ring)) error(`${where}: ring is not closed`);
      }
    }
  }

  if (regionOsm) {
    if (regionOsm.count !== regionOsm.features.length) error("osm-springs.geojson: count mismatch");
    if (regionOsm.count !== (index?.features ?? []).reduce((sum, feature) => sum + feature.properties.osm_springs_count, 0)) {
      error("osm-springs.geojson: total does not match the district counts in index.geojson");
    }
  }

  const sourcesFile = path.join(regionDir, "authoritative-sources.json");
  if (!existsSync(sourcesFile)) {
    error("authoritative-sources.json is missing");
  } else {
    try {
      const data = readJson(sourcesFile);
      if (!Array.isArray(data.sources) || data.sources.length === 0) error("authoritative-sources.json: sources must be a non-empty array");
      for (const source of data.sources ?? []) {
        const where = `authoritative-sources.json ${source.id ?? "<no id>"}`;
        if (!source.id || !source.name) error(`${where}: id and name are required`);
        if (typeof source.url !== "string" || !source.url.startsWith("http")) error(`${where}: url must be absolute`);
        if (!["high", "medium", "low"].includes(source.reliability)) error(`${where}: bad reliability`);
        if (source.checked && !isDate(source.checked)) warn(`${where}: checked is not YYYY-MM-DD`);
      }
    } catch (parseError) {
      error(`authoritative-sources.json: invalid JSON: ${parseError.message}`);
    }
  }

  const report = {
    region: flags.region,
    checked: today(),
    errors,
    warnings,
    files: {
      index: Boolean(index),
      boundaries: Boolean(boundaries),
      outline: Boolean(outline),
      water: Boolean(water),
      sea: Boolean(sea),
      osm_springs: Boolean(regionOsm),
      districts: indexSlugs.size,
    },
  };

  if (flags.out) writeJson(flags.out, report);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (errors.length > 0) process.exit(1);
};

if (isEntryPoint(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  });
}
