---
name: geo-region-assemble
description: "Assembles or refreshes the geo region dataset: OSM district boundaries, the OSM spring layer split by district, the lake and sea layers, index.geojson and contract validation. Triggers: assemble geo region, build geo data, refresh geo boundaries, refresh osm springs, water layer, sea layer, собрать geo регион, обновить geo данные."
---

# Geo region assemble

Builds the files under `geo/<region>/` from OpenStreetMap and the district folders. It refreshes
generated layers and the index. It never invents curated springs and never edits prose.

If the task needs more than one script, hand it to the `data-geo-assembler` agent. The agent runs
the stages in order and stops on the first failure.

## Read first

- `geo/README.md` in the project.
- `references/formats.md` in this skill.
- `references/pipeline.md` in this skill.
- `references/basemap.md` when the task includes the raster underlay.

## Stage order

Do not reorder these stages. Each one reads the output of the previous stage.

| Stage | Script | Writes |
|---|---|---|
| 1 | `scripts/fetch-region-outline.mjs` | `geo/<region>/region.geojson` |
| 2 | `scripts/fetch-boundaries.mjs` | `geo/<region>/boundaries.geojson` |
| 3 | `scripts/fetch-osm-springs.mjs` | `geo/<region>/osm-springs.geojson` and per-district `osm-springs.geojson` |
| 4 | `scripts/fetch-water.mjs` | `geo/<region>/water.geojson` |
| 5 | `scripts/fetch-seas.mjs` | `geo/<region>/sea.geojson` |
| 6 | `scripts/build-index.mjs` | `geo/<region>/index.geojson` |
| 7 | `scripts/validate-region.mjs` | stdout report, optional `--out` |
| 8 | `scripts/check-domain.mjs` (from `geo-domain-lib`) | stdout report |
| optional | `npm run basemap` in the project | `public/map/basemap.webp` and `.json` |

Run from the project root:

```bash
node ~/.config/opencode/skills/data/geo-region-assemble/scripts/fetch-region-outline.mjs --region leningrad-oblast --area 176095
node ~/.config/opencode/skills/data/geo-region-assemble/scripts/fetch-boundaries.mjs --region leningrad-oblast --area 176095
node ~/.config/opencode/skills/data/geo-region-assemble/scripts/fetch-osm-springs.mjs --region leningrad-oblast --area 176095
node ~/.config/opencode/skills/data/geo-region-assemble/scripts/fetch-water.mjs --region leningrad-oblast --area 176095
node ~/.config/opencode/skills/data/geo-region-assemble/scripts/fetch-seas.mjs --region leningrad-oblast
node ~/.config/opencode/skills/data/geo-region-assemble/scripts/build-index.mjs --region leningrad-oblast
node ~/.config/opencode/skills/data/geo-region-assemble/scripts/validate-region.mjs --region leningrad-oblast
node ~/.config/opencode/skills/data/geo-domain-lib/scripts/check-domain.mjs
```

Inside this skill the same scripts are addressed as `scripts/<name>.mjs`.

## Refresh an existing region

The index file provides the district name to slug mapping. Boundaries and OSM layers can be
regenerated without touching curated files. `build-index.mjs` recomputes counts, paths, bbox and
centroid, and copies district metadata from the index and the boundary feature.

## Bootstrap a new region

1. Create `geo/<region>/area.md` and one folder per district with `area.md` and `springs.geojson`.
2. Create `districts.json` with `name`, `slug` and `type` for every district.
3. Pass it to the first stage: `--districts districts.json --region-name "..."`.
4. Curated `springs.geojson` is written by a human or a separate catalog skill. Do not generate it
   from OSM.

The index is the mapping source for later refreshes.

## Arguments that matter

- `--region` is the folder slug, not the display name.
- `--area` is the OSM relation id of the region, without the `3600000000` offset.
- `--tolerance` on `fetch-region-outline.mjs` simplifies the outer boundary in degrees, default 0.002.
- `--min-area` defaults to 1 km² for lakes. Raising it reduces file size, lowering it adds small
  ponds that are barely visible on the map.
- `--input` on `fetch-water.mjs` replays a saved Overpass response for offline work.
- `--margin` on `fetch-seas.mjs` pads the region bbox before clipping the ocean, default 0.25 degrees.
  It must be large enough that the sea reaches the map edge, and small enough to keep the file tiny.
- `--tolerance` on `fetch-seas.mjs` simplifies sea rings in degrees, default 0.002.
- `--url` on `fetch-seas.mjs` points at another ocean GeoJSON; the default is Natural Earth 1:10m.
- `--endpoint` pins one Overpass mirror. Without it the scripts try the public list and retry on
  429, 502, 503 and 504.
- The basemap stage is optional and runs from the project, not from this skill, because it uses the
  project's `sharp` dependency. See `references/basemap.md`.

## Rules

- Two spring layers stay separate. `springs.geojson` is curated, `osm-springs.geojson` is raw OSM.
  Never merge them or copy chemistry into the OSM layer.
- Do not edit `area.md`, `authoritative-sources.json` or curated `springs.geojson` in this pipeline.
- Keep ODbL attribution on boundaries, OSM springs and lakes.
- The sea layer is Natural Earth 1:10m Ocean, public domain. Keep its `source` and `license` fields
  and the attribution on the maps. Do not mix it with the OSM lake layer.
- Counts must match. If `validate-region.mjs` fails, fix the data, do not relax the validator.
- Point coordinates are `[lon, lat]` in WGS84. Do not swap them.
- No `client:*` directives or UI edits in this skill. The map domain is covered by `geo-domain-lib`.

## Validation

- `validate-region.mjs` exits 0 with empty `errors`.
- `check-domain.mjs` exits 0 when the project has the TypeScript domain.
- In the project run `npm test`. Run `npm run build` when the pipeline touched the site data or pages.
- Report every stage, its exit code, and the counts from the final index.
