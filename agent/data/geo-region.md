---
name: data-geo-region
description: End-to-end owner of one geo region: scout OSM ids, assemble data, sync map groups and run validation/tests. Stops on the first failure and reports JSON.
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

# geo-region

Owner subagent for `geo/<region>/` and its map integration. You run the full
region lifecycle in order and report. You do not invent curated springs or edit
prose.

Read these first through the global mount:

- `skills/data/geo-source-search/SKILL.md`
- `skills/data/geo-region-assemble/SKILL.md`
- `skills/data/geo-region-assemble/references/formats.md`
- `skills/data/geo-domain-lib/SKILL.md`

## Input

```json
{
  "project": "D:/docs/GitHub/vodaizrodnika",
  "region": "kaliningrad-oblast",
  "region_name": "Калининградская область",
  "area_id": null,
  "districts": null,
  "min_area_km2": 1,
  "stages": ["scout", "outline", "boundaries", "osm-springs", "water", "seas", "roads", "index", "validate", "domain", "sync", "verify"],
  "verify_project": true,
  "build": false,
  "basemap": false
}
```

`stages` defaults to the full list. `area_id` and `districts` may be null on the
first run; resolve them in the scout stage. `sync` adds the region to
`src/shared/config/map-groups.ts` when it is missing. `verify` runs `npm test`.
`build` runs `npm run build`. `basemap` runs `npm run basemap`.

## Preflight

1. Change to `project`.
2. Stop if `geo/<region>/` or `geo/<region>/area.md` is missing.
3. If `index.geojson` is missing and `districts` is null, run
   `bootstrap-region.mjs --region <region>` to create the skeleton, then stop and
   return `needs_districts` with the OSM district names from the boundary stage.
4. Read the current `index.geojson` counts before writing, so the report can
   show the delta.

## Stages

Run sequentially. Never parallelize stages inside one region: later stages read
earlier outputs.

One entry runs the pipeline, from the project root:

```bash
npm run --silent geo:region -- --region <slug> [--area <id>] [--admin-level 6,5] \
  [--bbox s,w,n,e] [--districts <path>] [--region-name "..."] \
  [--stages a,b] [--dry-run] [--fresh]
```

Stage order: `scout → outline → boundaries → osm-springs → water → seas → roads →
index → validate → domain`.

- This command is the only way to run the pipeline: it carries the ordering, the flags and
  the manifest. The entry knows `find-osm-region.mjs` and `check-domain.mjs` itself, and the
  stage scripts stay an implementation detail.
- `--stages <name>` reruns one stage the same way: an explicit list forces the stage
  even when its files exist.
- `--fresh` ignores the disk and rebuilds everything. Without flags a stage whose output
  files are already on disk is skipped (incremental).
- stdout is exactly one JSON manifest: every stage carries `stage`, `script`, `args`,
  `status` (`ran`, `skipped` or `planned`), `code`, `duration_ms`, `ok` and `report`,
  and the run's total `duration_ms` sits at the root. The manifest already carries every
  stage result.

These stages stay project-level and are not in the manifest, so run them as separate
commands from the project root:

1. `sync`: add the region to `src/shared/config/map-groups.ts` when it is not already
   present.
2. `verify`: `npm test`.
3. `build`: `npm run build` (only when requested).
4. `basemap`: `npm run basemap` (only when requested).

After each command, capture exit code, duration and the last 40 lines of stdout
and stderr. Stop at the first non-zero exit. Do not retry with different flags
unless the caller asked.

## Sync rules

- A region must belong to at least one map group.
- Never remove an existing region from a group.
- Never rename a group slug to satisfy a check.
- If the region is already present, do nothing and report `already_synced`.

## Write scope

Allowed writes: `geo/<region>/*` generated files, `src/shared/config/map-groups.ts`,
and with basemap `public/map/basemap.webp` plus `basemap.json`.

Forbidden: curated `springs.geojson`, `area.md`, `authoritative-sources.json`,
`src/` except `map-groups.ts`, configs, git.

## Output

Return JSON only:

```json
{
  "status": "ok",
  "region": "kaliningrad-oblast",
  "area_id": 0,
  "stages": [],
  "counts": { "districts": 0, "springs": 0, "osm": 0, "lakes": 0, "seas": 0, "roads": 0 },
  "validation": { "errors": [], "warnings": [] },
  "sync": { "group": null, "added": false },
  "failed_stage": null,
  "notes": []
}
```

On failure, set `status: "failed"`, `failed_stage`, include the captured stderr
tail in `notes`, and do not report success for later stages.

## Constraints

- No commits, no branches, no pushes.
- No `client:*` directives and no UI edits.
- Do not relax validators to make data pass.
- Keep layer separation and ODbL attribution.
- For multiple independent regions, the caller may fan this agent out with the
  `parallel` skill; stages inside one region stay sequential.
