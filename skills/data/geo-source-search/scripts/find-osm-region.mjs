#!/usr/bin/env node
// Resolves a place name to OpenStreetMap relation and area ids through Nominatim.
// Read-only: prints JSON, writes only with --out.

import { writeJson } from "#lib/geo.mjs";
import { fetchText } from "#lib/http.mjs";
import { isEntryPoint, parseFlags } from "#lib/cli.mjs";

const ENDPOINT = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "opencode-skills-geo/1.0 (region lookup)";

const usage = `Usage:
  node scripts/find-osm-region.mjs --name "Ленинградская область" [--out candidates.json] [--limit 5]

Flags:
  --name    place name to resolve (required)
  --limit   Nominatim result limit, default 5
  --endpoint Overpass endpoint for tag lookup
  --out     write JSON to this file instead of stdout only`;

export async function findRegion({ name, limit = 5 }) {
  const params = new URLSearchParams({
    q: name,
    format: "jsonv2",
    limit: String(limit),
    addressdetails: "1",
    polygon_geojson: "0",
  });
  const text = await fetchText(`${ENDPOINT}?${params}`, { timeoutMs: 30000, userAgent: USER_AGENT });
  const rows = JSON.parse(text);
  if (!Array.isArray(rows)) throw new Error("Nominatim returned a non-array payload");
  return rows;
}

const toCandidate = (row) => ({
  osm_type: row.osm_type,
  osm_id: row.osm_id,
  area_id: row.osm_type === "relation" ? 3600000000 + Number(row.osm_id) : null,
  name: row.name || row.display_name,
  display_name: row.display_name,
  category: row.category,
  type: row.type,
  bbox: row.boundingbox?.map((value) => Number(value)) ?? null,
  importance: row.importance ?? null,
});

export async function resolveRegion(name, { limit = 5, lookupTags = true, endpoint = "https://overpass-api.de/api/interpreter" } = {}) {
  const rows = await findRegion({ name, limit });
  const candidates = rows.map(toCandidate);

  if (lookupTags) {
    const relationIds = candidates.filter((row) => row.osm_type === "relation").map((row) => row.osm_id);
    if (relationIds.length > 0) {
      const query = `[out:json][timeout:60];rel(id:${relationIds.join(",")});out tags;`;
      const body = new URLSearchParams({ data: query }).toString();
      const text = await fetchText(endpoint, {
        method: "POST",
        body,
        timeoutMs: 90000,
        userAgent: USER_AGENT,
      });
      const elements = JSON.parse(text).elements ?? [];
      const tagsById = new Map(elements.map((element) => [element.id, element.tags ?? {}]));
      for (const candidate of candidates) {
        const tags = tagsById.get(candidate.osm_id) ?? {};
        candidate.admin_level = tags.admin_level ?? null;
        candidate.boundary = tags.boundary ?? null;
      }
    }
  }

  const recommended = candidates.find(
    (candidate) => candidate.osm_type === "relation" && candidate.boundary === "administrative" && candidate.admin_level === "4",
  );

  return {
    query: name,
    candidates,
    recommended_osm_id: recommended?.osm_id ?? null,
    recommended_area_id: recommended?.area_id ?? null,
    notes: recommended
      ? []
      : ["No admin_level=4 boundary relation found. Check the candidate list or query Overpass directly."],
  };
}

const main = async () => {
  const flags = parseFlags(process.argv.slice(2), { name: "string", limit: "number", endpoint: "string", out: "string" });
  if (!flags.name) {
    process.stderr.write(`${usage}\n`);
    process.exit(1);
  }

  const result = await resolveRegion(flags.name, { limit: flags.limit ?? 5, endpoint: flags.endpoint });
  if (flags.out) writeJson(flags.out, result);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

  if (result.candidates.length === 0) process.exit(1);
};

if (isEntryPoint(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  });
}
