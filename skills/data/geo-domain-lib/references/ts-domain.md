# TypeScript geo domain

Lives in `src/shared/lib/geo/`. Runs at build time only. The site is SSG, so there is no data
fetching in the browser.

## `types.ts`

- `Ring`, `PolygonRings`, `MultiPolygonGeometry`.
- `WaterChemistry` with numeric fields and a `WaterClass` of source labels.
- `Spring` with district fields, `water`, `sanpin_2_1_4_1175_02`, `flags`, `data_completeness`,
  `status`, `note`, `source`, `confidence`.
- `OsmSpring` with `osm_id`, `osm_type`, `tags`, nullable chemistry, `confidence: "low"`.
- `Lake` with `osmId`, `osmType`, `name`, `areaKm2`, `geometry`, `districts`.
- `Sea` with `name`, `kind: "sea"` and `geometry`. It has no district attribution: the sea is a
  backdrop, not a spring layer.
- `MapPoint` with projected-agnostic `lon`, `lat`, `kind` and `href`.
- `District` with `springs`, `osm`, `geometry`, `bbox`, `osmRelationId`.
- `AdministrativeCenter` with `name`, `lon`, `lat`, `osmType`, `osmId`, `source`.
- `Region` with `water: Lake[]`, `sea: Sea[]`, `center: AdministrativeCenter | null`, counts and
  geometry.

`Lake.districts` is computed, not stored in `water.geojson`. `Sea` comes from `sea.geojson`, is
already clipped to the region bbox plus a margin, and keeps land and islands as holes.
`Region.center` comes from the optional collection-level `admin_center` in `index.geojson` and is
`null` when the region has none.

## `load.ts`

`listRegions()` scans `geo/` for folders with `index.geojson` and `area.md`.

`loadRegion(slug)`:

1. reads `index.geojson`;
2. reads each `<district>/springs.geojson`, checks `count`, index count, unique ids and finite
   coordinates;
3. reads `<district>/osm-springs.geojson` when present;
4. strips internal sections from `area.md`;
5. reads `water.geojson` when present and assigns district slugs;
6. reads `sea.geojson` when present and normalizes Polygon to MultiPolygon;
7. reads the optional collection-level `admin_center` and exposes it as `center`;
8. caches the region by slug.

`loadWater` samples outer rings, filters districts by bbox, then tests points with
`geometryContains`. The result is a list of slugs. A lake that crosses a border lands in several
districts. This is the only place that decides district membership for lakes.

`loadSea` reads `sea.geojson` when it exists, normalizes each geometry, requires a non-empty `name`,
and returns `Sea[]`. It does not run point-in-polygon: the sea belongs to the whole map. A malformed
or unnamed feature is skipped, not fatal.

`loadAllRegions()` maps every slug through the cache. `districtPath` and `springPath` build URLs.
URLs have no trailing slash.

## `contains.ts`

- `bboxOfGeometry` and `bboxIntersects`.
- `pointInRing` uses an even-odd crossing test.
- `geometryContains` toggles across rings, so holes are excluded.
- `sampleGeometryPoints` takes up to `limit` points per outer ring, spaced evenly. Used for cheap
  overlap checks.

## `basemap.ts`

`loadBasemap()` reads `public/map/basemap.json` once per build. `placeBasemap(meta, project)` turns
the raster bbox into SVG x, y, width and height. The raster is Web Mercator, so the projection is
linear and the image lines up with district paths without extra transforms. Missing metadata is not
an error: maps render without the underlay.

## Page wiring

| Page | Map |
|---|---|
| `/` | `MapSvg` with `sea={region.sea}`, `water={region.water}` and `center={region.center}` |
| `/[region]` | `MapSvg` with sea, water, center and district links |
| `/[region]/[district]` | `MapSvg` with sea, water, center, active district and lake list |
| `/[region]/[district]/[spring]` | `MapSvg` with sea, center and one point |
| `/map` | `InteractiveMap` with precomputed sea, district, lake and point geometry plus projected `center` |

The district page marks lakes outside the active district as muted and lists lakes that touch the
district. The list is built from `region.water.filter((lake) => lake.districts.includes(district.slug))`.
`center` is projected once on each page, so the marker lands on the same spot as the districts.

## Tests

`test/geo.test.ts` validates the loader, counts, coordinates and lake attribution. Add a test when
the loader gains a new invariant. `npm test` runs Vitest.

## Failure modes

- A count mismatch throws with `[geo]` prefix and fails the build.
- Missing `water.geojson` is allowed; the map renders without lakes.
- Missing `sea.geojson` is allowed; `Region.sea` becomes `[]` and the map renders without the sea.
- The sea geometry can exceed the district bounds, so never clamp it or clamp paths against the
  district bbox.
- Missing `admin_center` is allowed and `Region.center` becomes `null`. A present `admin_center`
  without a name or with non-finite coordinates throws.
- A lake with no matching district gets `districts: []` and is still rendered.
- Two districts can share a lake. Do not deduplicate by lake id in the district list.
