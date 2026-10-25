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

Run the whole chain with one script, from the project root:

`scripts/assemble.mjs` runs stages 1 to 7 in order, stops on the first non-zero exit and prints one
JSON manifest: per stage its script, arguments, exit code, duration and the report that stage wrote to
stdout. It writes no data of its own and no file in the repository, so the manifest can be read or
piped. Each stage keeps writing `geo/<region>/` and nothing else.

```bash
node ~/.config/opencode/skills/data/geo-region-assemble/scripts/assemble.mjs \
  --region leningrad-oblast --area 176095 --admin-level 6,5 --bbox 59.6,29.4,60.3,30.4
```

`--stages outline,boundaries,osm-springs,water,seas,index,validate` runs a subset, `--dry-run` prints
the plan without touching the network. Stage 8 is a separate domain guard of the project and stays
outside the manifest: run `scripts/check-domain.mjs` from `geo-domain-lib` after it.

A single stage stays runnable on its own and takes the same flags. Inside this skill the scripts are
addressed as `scripts/<name>.mjs`.

## Refresh an existing region

The index file provides the district name to slug mapping. Boundaries and OSM layers can be
regenerated without touching curated files. `build-index.mjs` recomputes counts, paths, bbox and
centroid, and copies district metadata from the index and the boundary feature.

## Bootstrap a new region

1. Create `geo/<region>/area.md` and one folder per district with `area.md` and `springs.geojson`.
2. Create `geo/<region>/districts.json` with `name`, `slug`, `type` and `subject` for every district.
   The format is in `references/formats.md`; a district outside the region relation also carries
   `outside_region_area: true` and the top-level `bbox` feeds `fetch-osm-springs.mjs --bbox`.
3. Pass it to the boundaries stage: `--districts geo/<region>/districts.json --region-name "..."`.
4. Curated `springs.geojson` is written by a human or a separate catalog skill. Do not generate it
   from OSM.

The index is the mapping source for later refreshes.

## Arguments that matter

- `--region` is the folder slug, not the display name.
- `--area` is the OSM relation id of the region, without the `3600000000` offset.
- `--admin-level` on `fetch-boundaries.mjs` and `assemble.mjs` lists the OSM levels to take, default
  `6`. Pass `6,5` when the region also holds city districts of a federal city: those relations sit
  at level 5 and a level-6-only query drops them without a word. The level stored on every feature
  is the level of its relation, not the flag.
- `--bbox south,west,north,east` on `fetch-osm-springs.mjs` adds an explicit box to the node query,
  for a territory that is not inside the region relation. With `--area` both filters are unioned, so a
  mixed region keeps its own nodes and the extra ones. The split by district still comes from
  `boundaries.geojson`, so the per-district files keep the same format.
- `--allow-drop` on `fetch-boundaries.mjs` allows removing a district that `boundaries.geojson` holds
  but the response does not contain. Without it the stage stops: an area query cannot see a district
  of a federal city, and a silent shrink would later be replaced with a bbox rectangle.
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
- `--stages` and `--dry-run` on `assemble.mjs` choose the subset and print the plan without the network.
- `--help` on every script in this folder prints its usage block and exits 0.
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
- `osm_admin_level` is data, not a setting: 6 for a district of the subject, 5 for a city district of
  a federal city. Never rewrite the level to satisfy a check; the validator accepts both and reads the
  value from the feature.
- Point coordinates are `[lon, lat]` in WGS84. Do not swap them.
- No `client:*` directives or UI edits in this skill. The map domain is covered by `geo-domain-lib`.

## Validation

- `validate-region.mjs` exits 0 with empty `errors`, and its report lists the district
  `admin_levels` it actually found.
- `assemble.mjs` exits 0 only when every stage in the run exited 0; the manifest names
  `failed_stage`, its `error` and a `hint` when the failure looks like a dead network.
- `check-domain.mjs` exits 0 when the project has the TypeScript domain.
- In the project run `npm test`. Run `npm run build` when the pipeline touched the site data or pages.
- Report every stage, its exit code, and the counts from the final index.
