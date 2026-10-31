---
name: geo-region-assemble
description: "Assembles or refreshes the geo region dataset: OSM district boundaries, the OSM spring layer split by district, the lake and sea layers, index.geojson and contract validation. Triggers: assemble geo region, build geo data, refresh geo boundaries, refresh osm springs, water layer, sea layer, собрать geo регион, обновить geo данные."
---

# Geo region assemble

Builds the files under `geo/<region>/` from OpenStreetMap and the district folders. It refreshes
generated layers and the index. It never invents curated springs and never edits prose.

The whole chain runs through one entry point, from the project root. A human and the
`data-geo-region` / `data-geo-assembler` agent call the same command: it runs the stages in order,
stops on the first failure and prints one JSON manifest.

## Read first

- `geo/README.md` in the project.
- `references/formats.md` in this skill.
- `references/pipeline.md` in this skill.
- `references/basemap.md` when the task includes the raster underlay.

## Stage order

Do not reorder these stages. Each one reads the output of the previous stage.

| # | Stage | Script | Writes |
|---|---|---|---|
| 1 | `scout` | resolved by the entry (`find-osm-region.mjs` from `geo-source-search`) | nothing |
| 2 | `outline` | `scripts/fetch-region-outline.mjs` | `geo/<region>/region.geojson` |
| 3 | `boundaries` | `scripts/fetch-boundaries.mjs` | `geo/<region>/boundaries.geojson` |
| 4 | `osm-springs` | `scripts/fetch-osm-springs.mjs` | `geo/<region>/osm-springs.geojson` and per-district `osm-springs.geojson` |
| 5 | `water` | `scripts/fetch-water.mjs` | `geo/<region>/water.geojson` |
| 6 | `seas` | `scripts/fetch-seas.mjs` | `geo/<region>/sea.geojson` |
| 7 | `roads` | `scripts/fetch-roads.mjs` | `geo/<region>/roads.geojson` |
| 8 | `index` | `scripts/build-index.mjs` | `geo/<region>/index.geojson` |
| 9 | `validate` | `scripts/validate-region.mjs` | stdout report only |
| 10 | `domain` | resolved by the entry (`check-domain.mjs` from `geo-domain-lib`) | nothing |
| optional | `basemap` | `npm run basemap` in the project | `public/map/basemap.webp` and `.json` |

`scout` and `domain` are carried out by the entry itself, not spawned as separate stages of this
folder, and neither writes a file: `scout` fills `area` into the manifest, `domain` reports on stdout.

## Run the whole chain

From the project root, one command:

```bash
npm run --silent geo:region -- --region leningrad-oblast --area 176095 --admin-level 6,5
```

It runs the ten stages in order, stops on the first non-zero stage and prints exactly one JSON
manifest on stdout. Each stage's progress goes to stderr, so stdout parses as one object. `--silent`
keeps npm's script banner off stdout, so the manifest is the only thing there. The entry writes no
data and no file in the repository of its own: every data stage keeps writing `geo/<region>/` and
nothing else.

A single stage is the same command with `--stages`:

```bash
npm run --silent geo:region -- --region leningrad-oblast --stages boundaries
```

Run the chain through this project entry: it carries the ordering, the flags and the manifest. The
stage scripts under `scripts/` stay an implementation detail.

### Incrementality

- Without `--stages` and without `--fresh`, a stage is skipped when its output files are already on
  disk **and** no earlier stage in this run performed work. A stage whose input became dirty runs
  anyway: otherwise `index.geojson` would drift from a rebuilt `boundaries.geojson`.
- `--stages a,b` runs exactly the listed stages and forces them, even when the files exist. The
  explicit list is the "rebuild this" request; there is no separate `--force`.
- `--fresh` ignores the disk and runs the whole set, which by default is all ten stages.
- `scout` has no artifact: it is skipped when `--area` is given or `index.geojson` already holds
  `area_id`, and otherwise resolves the region through `find-osm-region.mjs`.
- `validate` and `domain` always run: their value is the check, not a file on disk.
- "Built" for `osm-springs` means `geo/<region>/osm-springs.geojson` **and** a per-district file for
  every district in `boundaries.geojson`. Missing any one of them runs the stage.

### The manifest

```json
{
  "region": "leningrad-oblast",
  "area": 176095,
  "ok": true,
  "failed_stage": null,
  "duration_ms": 8431,
  "stages": [
    { "stage": "boundaries", "script": "fetch-boundaries.mjs", "args": ["--region", "leningrad-oblast"],
      "status": "ran", "code": 0, "duration_ms": 1204, "ok": true, "report": {} }
  ],
  "error": null,
  "hint": null,
  "needs_districts": null
}
```

One JSON per run on stdout, with a per-stage `stage`, `script`, `args`, `status`, `code`,
`duration_ms`, `ok` and `report` (the stage's own stdout report). `status` is `ran`, `skipped` or
`planned`; `duration_ms` is reported per stage and at the root. `--dry-run` prints the plan: every
stage listed with status `planned` or `skipped`, nothing executes, the network is untouched, exit 0.
`needs_districts` is a normal stop for a new region, not a failure: exit 0.

## Refresh an existing region

The index file provides the district name to slug mapping. Boundaries and OSM layers can be
regenerated without touching curated files. The `index` stage recomputes counts, paths, bbox and
centroid, and copies district metadata from the index and the boundary feature.

A refresh reuses what is on disk: `npm run --silent geo:region -- --region <region> --area <id>` skips every
data stage whose files exist and still runs `validate` and `domain`. Force one layer with
`--stages boundaries` (then `index` and `validate` follow, because their input became dirty), and
rebuild everything with `--fresh`.

## Bootstrap a new region

1. Create `geo/<region>/area.md` and one folder per district with `area.md` and `springs.geojson`.
2. Create `geo/<region>/districts.json` with `name`, `slug`, `type` and `subject` for every district.
   The format is in `references/formats.md`; a district outside the region relation also carries
   `outside_region_area: true` and the top-level `bbox` feeds the `osm-springs` stage.
3. Run the boundaries stage through the entry:
   `npm run --silent geo:region -- --region <region> --stages boundaries --districts geo/<region>/districts.json --region-name "..."`.
   A new region with districts but no `index.geojson` stops with `needs_districts` and exit 0; that
   is the expected first result, not a failure.
4. Curated `springs.geojson` is written by a human or a separate catalog skill. Do not generate it
   from OSM.

The index is the mapping source for later refreshes.

## Arguments that matter

- `--region` is the folder slug, not the display name.
- `--area` is the OSM relation id of the region, without the `3600000000` offset.
- `--admin-level` is forwarded to the `boundaries` stage and lists the OSM levels to take, default
  `6`. Pass `6,5` when the region also holds city districts of a federal city: those relations sit
  at level 5 and a level-6-only query drops them without a word. The level stored on every feature
  is the level of its relation, not the flag.
- `--bbox south,west,north,east` on the `osm-springs` stage adds an explicit box to the node query,
  for a territory that is not inside the region relation. With `--area` both filters are unioned, so a
  mixed region keeps its own nodes and the extra ones. The split by district still comes from
  `boundaries.geojson`, so the per-district files keep the same format.
- `--allow-drop` on the `boundaries` stage allows removing a district that `boundaries.geojson` holds
  but the response does not contain. Without it the stage stops: an area query cannot see a district
  of a federal city, and a silent shrink would later be replaced with a bbox rectangle.
- `--tolerance` on the `outline` stage simplifies the outer boundary in degrees, default 0.002.
- `--min-area` on the `water` stage defaults to 1 km² for lakes. Raising it reduces file size,
  lowering it adds small ponds that are barely visible on the map.
- `--input` on the `water` stage replays a saved Overpass response for offline work. No other stage
  takes it.
- `--margin` on the `seas` stage pads the region bbox before clipping the ocean, default 0.25 degrees.
  It must be large enough that the sea reaches the map edge, and small enough to keep the file tiny.
- `--tolerance` on the `seas` stage simplifies sea rings in degrees, default 0.002.
- `--url` on the `seas` stage points at another ocean GeoJSON; the default is Natural Earth 1:10m.
- `--endpoint` pins one Overpass mirror for every stage that queries it. Without it the stages try the
  public list and retry on 429, 502, 503 and 504.
- `--stages a,b` forces the listed stages and only those, even when their files exist. It is the
  rebuild request for a single stage; there is no separate `--force`.
- `--fresh` ignores what is already on disk and rebuilds the whole set. Use it after a schema change
  that the per-stage skip cannot see.
- `--dry-run` prints the plan with statuses `planned` and `skipped`, runs nothing and touches no
  network; exit 0. Use it to check which stages a run would actually perform.
- `--help` on the entry prints its usage block and exits 0.
- The basemap stage is optional and runs from the project, not from this skill, because it uses the
  project's `sharp` dependency. See `references/basemap.md`.

## Rules

- Two spring layers stay separate. `springs.geojson` is curated, `osm-springs.geojson` is raw OSM.
  Never merge them or copy chemistry into the OSM layer.
- `roads.geojson` is a decorative layer from OSM highways. It never carries per-road properties and
  never mixes with spring layers. A missing file is allowed.
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

## Parallel runs

Several independent regions can be assembled in one pass. Each region keeps its
own sequential stages, so fan the `data-geo-region` agent out with the `parallel`
skill rather than running the stages of two regions interleaved.

## Basemap (optional)

The basemap stage is project-local because it uses the project's `sharp` dependency and the EOX
tiles. Run it from the project root:

```bash
npm run basemap
```

It writes `public/map/basemap.webp` and `public/map/basemap.json`. It is never part of the
network assembly manifest.

## Validation

- The `validate` stage exits 0 with empty `errors`, and its report lists the district
  `admin_levels` it actually found.
- The entry exits 0 only when every stage in the run exited 0; the manifest names `failed_stage`,
  its `error` and a `hint` when the failure looks like a dead network. `skipped` is never an error.
- The `domain` stage exits 0 when the project has the TypeScript domain. Both `validate` and `domain`
  run on every invocation, including one where every data stage was skipped.
- In the project run `npm test`. Run `npm run build` when the pipeline touched the site data or pages.
- Report every stage, its exit code, and the counts from the final index.
