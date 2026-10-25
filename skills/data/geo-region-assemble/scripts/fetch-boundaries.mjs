#!/usr/bin/env node
// Fetches district boundaries for a region and writes geo/<region>/boundaries.geojson.
// Reads the existing index for name to slug mapping; for a new region pass --districts
// with the same mapping. The OSM admin_level is read from every relation, because a
// region may own districts of two levels (see --admin-level).

import { existsSync } from "node:fs";
import path from "node:path";
import {
  OSM_LICENSE,
  OSM_SOURCE,
  overpass,
  overpassAreaId,
  polygonToGeometry,
  readJson,
  relationPolygons,
  today,
  writeJson,
} from "#lib/geo.mjs";
import { isEntryPoint, parseFlags, wantsHelp } from "#lib/cli.mjs";

const usage = `Usage:
  node scripts/fetch-boundaries.mjs --region leningrad-oblast --area 176095
  node scripts/fetch-boundaries.mjs --region leningrad-oblast --area 176095 --admin-level 6,5
  node scripts/fetch-boundaries.mjs --region my-region --area 123456 --districts districts.json --region-name "Мой регион"

Flags:
  --region         geo folder name (required)
  --area           OSM relation id of the region (required)
  --admin-level    comma separated OSM admin_level values, default 6. Pass 6,5 when the
                   region also holds city districts of a federal city: those sit at level 5,
                   and a level-6-only query drops them without a word
  --districts      JSON array of { name, slug, type } for a new region
  --region-name    display name when index.geojson does not exist
  --admin-subject  subject name for feature properties
  --out            output path, default geo/<region>/boundaries.geojson
  --endpoint       Overpass endpoint, default https://overpass-api.de/api/interpreter
  --allow-drop     let the run remove a district that boundaries.geojson holds but the
                   response does not contain; without it the run stops, because a silent
                   shrink loses a real boundary
  --help           print this usage and exit`;

/** `6` or `6,5` to a sorted list of integer levels; a typo stops the run, not the query. */
const parseLevels = (value) => {
  const parts = String(value ?? "6")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const levels = parts.map((item) => Number(item));
  if (levels.length === 0 || levels.some((item) => !Number.isInteger(item) || item <= 0)) {
    throw new Error(`--admin-level takes comma separated integers, for example 6 or 6,5; got "${value}"`);
  }
  return [...new Set(levels)].sort((left, right) => right - left);
};

const levelFilter = (levels) =>
  levels.length === 1 ? `["admin_level"="${levels[0]}"]` : `["admin_level"~"^(${levels.join("|")})$"]`;

const normalizeName = (value) =>
  value
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ")
    .trim();

const rootName = (value) =>
  normalizeName(value)
    .replace(/\s+(муниципальный|городской)\s+(район|округ)$/, "")
    .replace(/\s+(район|округ)$/, "")
    .trim();

const loadMapping = (existing, districtsFile) => {
  const byName = new Map();
  const byRoot = new Map();

  const add = (name, entry) => {
    if (!name) return;
    byName.set(normalizeName(name), entry);
    const root = rootName(name);
    if (!root) return;
    const current = byRoot.get(root);
    byRoot.set(root, current && current.slug !== entry.slug ? null : entry);
  };

  for (const feature of existing?.features ?? []) {
    const props = feature.properties ?? {};
    if (props.district && props.district_slug) {
      add(props.district, {
        name: props.district,
        slug: props.district_slug,
        type: props.district_type,
        subject: props.admin_subject,
      });
    }
  }

  if (districtsFile) {
    if (!existsSync(districtsFile)) throw new Error(`districts file not found: ${districtsFile}`);
    const data = readJson(districtsFile);
    const rows = Array.isArray(data) ? data : data.districts;
    if (!Array.isArray(rows)) throw new Error("districts file must be an array or { districts: [...] }");
    for (const row of rows) {
      const name = row.name ?? row.district;
      const slug = row.slug ?? row.district_slug;
      if (!name || !slug) throw new Error("every district needs name and slug");
      add(name, { name, slug, type: row.type ?? row.district_type, subject: row.subject ?? row.admin_subject });
    }
  }

  return (name) => byName.get(normalizeName(name)) ?? byRoot.get(rootName(name)) ?? null;
};

const main = async () => {
  if (wantsHelp(process.argv.slice(2))) {
    process.stdout.write(`${usage}\n`);
    return;
  }

  const flags = parseFlags(process.argv.slice(2), {
    region: "string",
    area: "number",
    "admin-level": "string",
    districts: "string",
    "region-name": "string",
    "admin-subject": "string",
    out: "string",
    endpoint: "string",
    "allow-drop": "boolean",
  });

  if (!flags.region) throw new Error("--region is required");
  if (!flags.area) throw new Error("--area is required");
  const levels = parseLevels(flags["admin-level"]);

  const regionDir = path.join(process.cwd(), "geo", flags.region);
  const indexPath = path.join(regionDir, "index.geojson");
  const existing = existsSync(indexPath) ? readJson(indexPath) : null;

  const regionName = flags["region-name"] ?? existing?.name;
  if (!regionName) throw new Error("--region-name is required when index.geojson is missing");
  const adminSubject = flags["admin-subject"] ?? existing?.admin_subject ?? regionName;
  const mapping = loadMapping(existing, flags.districts);
  const query = `[out:json][timeout:300];
area(${overpassAreaId(flags.area)})->.a;
rel["boundary"="administrative"]${levelFilter(levels)}(area.a);
out body geom;`;

  process.stderr.write(
    `Requesting district boundaries (admin_level ${levels.join(",")}) for area ${flags.area}...\n`,
  );
  const payload = await overpass(query, { endpoint: flags.endpoint });
  const elements = payload.elements ?? [];
  process.stderr.write(`Overpass returned ${elements.length} relations\n`);

  const features = [];
  const missingMapping = [];
  const skipped = [];

  for (const element of elements) {
    const tags = element.tags ?? {};
    const names = [tags["name:ru"], tags.name, tags.official_name].filter(Boolean);
    const name = names[0] ?? `relation ${element.id}`;
    const mapped = names.map((candidate) => mapping(candidate)).find(Boolean) ?? null;
    if (!mapped) {
      missingMapping.push(name);
      continue;
    }

    // The query filters by level, so the tag is the truth about this relation.
    const adminLevel = Number(tags.admin_level);
    if (!Number.isInteger(adminLevel)) {
      skipped.push(`${name}: no admin_level tag`);
      continue;
    }

    const polygons = relationPolygons(element.members ?? []);
    if (polygons.length === 0) {
      skipped.push(`${name}: no closed rings`);
      continue;
    }

    features.push({
      type: "Feature",
      id: mapped.slug,
      geometry: polygonToGeometry(polygons),
      properties: {
        district: mapped.name ?? name,
        district_slug: mapped.slug,
        district_type: mapped.type ?? "муниципальный район",
        admin_subject: mapped.subject ?? adminSubject,
        osm_relation_id: element.id,
        osm_admin_level: adminLevel,
        source: OSM_SOURCE,
      },
    });
  }

  if (missingMapping.length > 0) {
    throw new Error(
      `No slug mapping for: ${missingMapping.join(", ")}. Add these names to the existing index or pass --districts.`,
    );
  }
  if (features.length === 0) throw new Error("No boundaries assembled");

  // Replacing the collection is how a refresh works, but losing a district is not: a
  // district of a federal city is not inside the region area, so an area query cannot see
  // it, and a silent shrink would later be papered over with a bbox rectangle by
  // build-index.mjs. Stop instead, and let the caller decide.
  const incoming = new Set(features.map((feature) => feature.properties.district_slug));
  const dropped = (existing?.features ?? [])
    .map((feature) => feature.properties?.district_slug)
    .filter((slug) => Boolean(slug) && !incoming.has(slug));
  if (dropped.length > 0 && !flags["allow-drop"]) {
    throw new Error(
      `The response has no boundary for ${dropped.join(", ")}, which boundaries.geojson already holds. ` +
        "Such a district usually sits outside the region relation (a city district of a federal city), " +
        "so an area query cannot return it. Refresh it separately, or pass --allow-drop to remove it on purpose.",
    );
  }

  const order = new Map((existing?.features ?? []).map((feature, index) => [feature.properties?.district_slug, index]));
  features.sort((a, b) => {
    const left = order.has(a.properties.district_slug) ? order.get(a.properties.district_slug) : Number.MAX_SAFE_INTEGER;
    const right = order.has(b.properties.district_slug) ? order.get(b.properties.district_slug) : Number.MAX_SAFE_INTEGER;
    return left === right ? a.properties.district.localeCompare(b.properties.district, "ru") : left - right;
  });

  const outFile = flags.out ? path.resolve(flags.out) : path.join(regionDir, "boundaries.geojson");
  const collection = {
    type: "FeatureCollection",
    name: `${regionName} — границы районов`,
    region: flags.region,
    license: OSM_LICENSE,
    generated: today(),
    count: features.length,
    features,
  };

  writeJson(outFile, collection);

  const report = {
    region: flags.region,
    area: flags.area,
    admin_levels: levels,
    out: path.relative(process.cwd(), outFile),
    count: features.length,
    districts: features.map((feature) => `${feature.properties.district_slug}:${feature.properties.district}`),
    dropped,
    skipped,
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
};

if (isEntryPoint(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  });
}
