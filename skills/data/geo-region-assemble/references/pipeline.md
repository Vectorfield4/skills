# Assembly pipeline

Seven stages, fixed order. `scripts/assemble.mjs` runs stages 1 to 7 in sequence and prints one JSON
manifest; every stage is also a standalone script with its own `--help`, so read that or the usage
block in the file when a flag is unclear.

## 1. Region outline

`scripts/fetch-region-outline.mjs` queries the region relation, assembles its rings, simplifies them
and writes `region.geojson`. The map draws only this outer line by default; internal district
borders stay hidden.

## 2. Boundaries

`scripts/fetch-boundaries.mjs` queries `rel["boundary"="administrative"]` inside the region area,
assembles member ways into rings, assigns holes, and maps OSM names to district slugs. The level comes
from `--admin-level`: `6` by default, `6,5` when the region also holds city districts of a federal
city, because those relations sit at level 5 and a level-6-only query drops them silently. The level
written to each feature is the level of its own relation.

Input: region slug, OSM relation id, `--admin-level`. Mapping comes from the existing `index.geojson`;
for a new region pass `--districts geo/<region>/districts.json`.

Failure: an OSM district without a slug mapping stops the script before writing. Add the name to the
mapping; do not invent a slug that later diverges from the folder name. A district that the current
`boundaries.geojson` holds but the response does not also stops the run — the collection is replaced,
so removing one is allowed only through `--allow-drop`.

Output: `boundaries.geojson` with MultiPolygon features and ODbL attribution.

## 3. OSM springs

`scripts/fetch-osm-springs.mjs` queries nodes tagged `natural=spring` and `waterway=spring`, places
each node in a district by point in polygon, writes the region collection and one file per district.

Input: region slug, OSM relation id, or `--bbox south,west,north,east` for a territory that is not
inside the region relation. With both, the two filters are unioned, so a mixed region keeps the nodes
of its own area and the ones in the box. The bbox changes only the query: the split by district still
comes from `boundaries.geojson`, so the per-district files keep the same shape.

Failure: nodes outside every boundary are counted in `skipped_outside_boundaries` and dropped. A
large number means the boundary layer is incomplete. Fix boundaries, do not widen the polygons by
hand.

Output: `osm-springs.geojson` and `<district>/osm-springs.geojson`. A district with zero nodes gets
no file; stale files are removed.

## 4. Lakes

`scripts/fetch-water.mjs` queries `natural=water + water=lake`, assembles relations, drops lakes
below `--min-area` (default 1 km²), keeps lakes that touch the region, simplifies rings.

Input: region slug, OSM relation id, or `--input` with a saved Overpass response.

Failure: a lake relation whose rings do not close is skipped silently. Check the feature count if a
known large lake is missing.

Output: `water.geojson`. Coordinates are rounded to five decimals and rings simplified at
`--tolerance` degrees (default 0.002).

## 5. Seas

`scripts/fetch-seas.mjs` reads the region bbox from `boundaries.geojson`, expands it by `--margin`
(default 0.25 degrees), downloads Natural Earth 1:10m Ocean, and clips every ring to that box. Holes
stay holes, because the ocean polygon represents land and islands as holes and the map fills the
water with an even-odd rule.

Input: region slug and `boundaries.geojson`; `--url` replays another ocean file.

Failure: zero surviving polygons stops the script with a clear error. That means the bbox misses the
sea or the source file is wrong; raise `--margin` or check `--url` instead of hand-drawing water.

Output: `sea.geojson`, one MultiPolygon feature with `kind: "sea"`, `Public domain` and the Natural
Earth source. Rings are rounded to five decimals and simplified at `--tolerance` degrees
(default 0.002). The file stays small: the sea is a backdrop, not a coastline dataset.

## 6. Index

`scripts/build-index.mjs` reads district folders, boundaries and both spring layers. It recomputes
`springs_count`, `osm_springs_count`, paths, bbox and centroid of curated springs, and the boundary
geometry. Metadata for existing districts comes from the current index; new districts come from the
boundary feature.

Input: region slug. Requires every district folder with `area.md` and `springs.geojson`.

Failure: a missing folder or file stops the script. The index is not partially written.

Output: `index.geojson`.

## 7. Contract validation

`scripts/validate-region.mjs` checks every file against `formats.md`: collection counts, unique ids,
required properties, coordinate ranges, layer separation, ring closure, ODbL strings, source
records.

Exit 0 means no errors. Warnings do not fail the run.

## 8. Domain check

`scripts/check-domain.mjs` from the `geo-domain-lib` skill verifies that the project's TypeScript
domain still exposes the modules and props that consume this data.

Both checks run after the data stages. A failure here is a contract break, not a formatting issue.

## Refresh versus bootstrap

Refresh an existing region: run stages 1 to 8 with the region slug and area id. Curated files are
untouched.

Bootstrap a region: create folders and `area.md` files first, provide `districts.json`, generate
boundaries and OSM layers, then index. Curated `springs.geojson` must exist before stage 4, even if
it is an empty FeatureCollection.

## Agent run

The `data-geo-assembler` agent receives project path, region, area id, optional districts mapping and
the stage list. It runs `assemble.mjs` (or the stages one by one), stops on the first non-zero exit,
and returns the manifest: per-stage status, duration and counts. It does not edit prose and does not
commit.
