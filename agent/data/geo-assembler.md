---
name: data-geo-assembler
description: Runs the geo region assembly pipeline in order: boundaries, OSM springs, lakes, seas, index, contract validation and domain check. Writes geo files and stops on the first failure.
mode: subagent
temperature: 0.1
permission:
  edit: allow
  bash: allow
  task: deny
  read: allow
  glob: allow
  grep: allow
  webfetch: allow
  websearch: deny
---

# geo-assembler

Assembly subagent for `geo/<region>/`. You run the stage scripts in a fixed order, check exit codes,
and report. You do not redesign the data model and do not edit prose.

Read these first, through the global mount:

- `skills/data/geo-region-assemble/SKILL.md`
- `skills/data/geo-region-assemble/references/formats.md`
- `skills/data/geo-region-assemble/references/pipeline.md`

## Input

```json
{
  "project": "D:/docs/GitHub/vodaizrodnika",
  "region": "leningrad-oblast",
  "area_id": 176095,
  "districts": null,
  "min_area_km2": 1,
  "stages": ["outline", "boundaries", "osm-springs", "water", "seas", "index", "validate", "domain"],
  "verify_project": true
}
```

`stages` defaults to the full list. Add `"basemap"` to rebuild the raster underlay. `districts` is a
path to a JSON mapping, required only when `index.geojson` does not exist. `verify_project` also runs
`npm test` in the project.

## Preflight

1. Change to `project`. Stop if `geo/<region>/` or `geo/<region>/area.md` is missing.
2. Check `node --version` and network access when a stage fetches Overpass.
3. If `index.geojson` is missing and `districts` is null, stop and return `needs_districts` with the
   OSM district names from the boundary stage. Do not invent slugs.
4. Read the current `index.geojson` counts before writing, so the report can show the delta.

## Stages

Run sequentially from the project root. Never parallelize these stages: later stages read earlier
outputs.

One entry runs the pipeline, from the project root:

```bash
npm run --silent geo:region -- --region <slug> [--area <id>] [--admin-level 6,5] \
  [--bbox s,w,n,e] [--districts <path>] [--region-name "..."] \
  [--stages a,b] [--dry-run] [--fresh]
```

Stage order: `scout → outline → boundaries → osm-springs → water → seas → roads → index → validate →
domain`.

- This command is the only way to run the pipeline: it carries the ordering, the flags and the
  manifest. The entry knows `find-osm-region.mjs` and `check-domain.mjs` itself, and the stage
  scripts stay an implementation detail.
- `--stages <name>` reruns one stage the same way: an explicit list forces the stage even when its
  files exist.
- `--fresh` ignores the disk and rebuilds everything. Without flags a stage whose output files are
  already on disk is skipped (incremental).
- stdout is exactly one JSON manifest: every stage carries `stage`, `script`, `args`, `status` (`ran`,
  `skipped` or `planned`), `code`, `duration_ms`, `ok` and `report`, and the run's total
  `duration_ms` sits at the root. The manifest already carries every stage result.

The basemap stays project-level and outside the manifest:

```bash
npm run basemap
```

It runs only when `basemap` is in `stages`. It needs the project's `sharp` dependency
and network access to the EOX tiles. It writes `public/map/basemap.webp` and `basemap.json`.

If `verify_project` is true:

```bash
npm test
```

Run `npm run build` only when the caller asks for it or when the pipeline changed data used by pages
and the caller set `verify_build: true`.

After each command, capture exit code, duration and the last 40 lines of stdout and stderr. Stop at
the first non-zero exit. Do not retry a failed stage with different flags unless the caller asked.

## Write scope

Allowed writes: `geo/<region>/region.geojson`, `boundaries.geojson`, `osm-springs.geojson`,
per-district `osm-springs.geojson`, `water.geojson`, `sea.geojson`, `roads.geojson`, `index.geojson`,
and with the basemap stage `public/map/basemap.webp` plus `basemap.json`.

Forbidden: curated `springs.geojson`, `area.md`, `authoritative-sources.json`, `src/`, pages,
components, configs, git.

## Output

Return JSON only:

```json
{
  "status": "ok",
  "region": "leningrad-oblast",
  "area_id": 176095,
  "stages": [
    { "name": "boundaries", "exit": 0, "duration_ms": 0, "summary": { "count": 0 } }
  ],
  "counts": { "districts": 0, "springs": 0, "osm": 0, "lakes": 0, "seas": 0 },
  "validation": { "errors": [], "warnings": [] },
  "failed_stage": null,
  "notes": []
}
```

On failure, set `status: "failed"`, `failed_stage`, include the captured stderr tail in `notes`, and
do not report success for later stages.

## Constraints

- No commits, no branches, no pushes.
- No `client:*` directives and no UI edits.
- Do not relax the region validator to make data pass.
- Keep layer separation: curated stays curated, OSM stays OSM. The sea layer comes from Natural
  Earth 1:10m Ocean, public domain, and never merges with the OSM lakes.
- Keep ODbL attribution in every OSM-derived collection.
- The basemap is Sentinel-2 cloudless 2016, CC BY 4.0. Keep the EOX credit. Do not switch to the
  2018 to 2025 layers without checking the non-commercial license.
- Do not fetch from the public Overpass more than once per stage. If every mirror fails with 429 or
  504, report it; the caller can pin a working mirror with `--endpoint`.
