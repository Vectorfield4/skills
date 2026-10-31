---
name: geo-source-search
description: "Finds and probes data sources for a geo region: OSM relation and area ids, Overpass coverage, catalog and reference URLs. Read-only. Triggers: geo source search, find geo sources, probe geo sources, OSM region lookup, источники geo, поиск источников geo."
---

# Geo source search

Discovery step for the geo data pipeline. Resolves a region name to OSM ids and checks which
sources still answer. Returns JSON. It does not write `geo/` files and does not assemble data.

Assembly is a separate skill: `geo-region-assemble`. Source policy and licensing live in
`references/sources.md`. For the full two-script search, hand the job to the `data-geo-scout`
agent.

## Inputs

- region name, for example `Ленинградская область`;
- optional `geo/<region>/authoritative-sources.json`;
- optional OSM relation id for an Overpass coverage check.

Run from the project root. Scripts live next to this file under `scripts/`.

## Steps

1. Resolve the region in OSM:

```bash
node scripts/find-osm-region.mjs --name "Ленинградская область" --out .geo-scout/osm-region.json
```

The script asks Nominatim, keeps every candidate, then loads tags for the relation candidates in
one Overpass call. `recommended_area_id` is the `admin_level=4` relation with `area_id = 3600000000 + osm_id`.
If no admin relation is found, the script exits 1 and lists the candidates.

2. Probe the sources:

```bash
node scripts/probe-sources.mjs \
  --sources geo/leningrad-oblast/authoritative-sources.json \
  --overpass-area 176095 \
  --out .geo-scout/sources.json
```

The probe reports status, final URL, content type, charset, title and elapsed time. For an OSM area
it also counts springs, lakes and `admin_level=6` boundaries. If every URL fails, the script exits 1.

3. Read the two JSON files and decide what to assemble.

## Output

`find-osm-region.mjs`:

```json
{
  "query": "Ленинградская область",
  "candidates": [{ "osm_type": "relation", "osm_id": 176095, "area_id": 3600176095, "admin_level": "4" }],
  "recommended_osm_id": 176095,
  "recommended_area_id": 3600176095,
  "notes": []
}
```

`probe-sources.mjs`:

```json
{
  "checked": "2026-10-24",
  "sources": [{ "id": "osm-overpass", "url": "https://overpass-api.de/", "ok": true, "status": 200 }],
  "reachable": 7,
  "overpass": { "springs": 605, "lakes": 2233, "district_boundaries": 18, "roads": 4200 }
}
```

## Rules

- Read-only. The only writes are `--out` reports. Never touch `geo/`, `src/` or the site build.
- Use the public Overpass instances for probes. Assembly scripts accept `--endpoint` to pin one
  mirror; without it they retry over the public list.
- Do not invent URLs, source ids or coverage numbers. Everything comes from the response.
- OpenStreetMap is ODbL. Any downstream dataset keeps the attribution.
- A reachable source can still be unusable: read `caveats` in `authoritative-sources.json` before
  recommending it.

## Validation

- `recommended_area_id` is numeric and the relation is the region, not a district.
- Every probed source has `ok`, `status` and `elapsed_ms`.
- The report is written only when `--out` is passed.
