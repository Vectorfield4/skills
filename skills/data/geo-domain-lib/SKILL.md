---
name: geo-domain-lib
description: "Documents and guards the geo TypeScript domain: data types, loaders, projection, SVG paths, lake attribution, the sea backdrop and the interactive map island. Triggers: geo domain, geo lib, geo types, map domain, проверить geo домен, geo ts domain."
---

# Geo domain lib

Reference and guard for `src/shared/lib/geo/*` in the vodaizrodnika project, plus the pages and the
map island that consume it.

The data files are covered by `geo-region-assemble`. This skill covers the TypeScript side and the
rendering contract.

## Modules

| Module | Responsibility |
|---|---|
| `types.ts` | `Spring`, `OsmSpring`, `Lake`, `Sea`, `District`, `Region`, `MapPoint`, geometry types |
| `load.ts` | reads `geo/` at build time, validates counts, caches regions, assigns lakes to districts, loads the sea backdrop |
| `contains.ts` | bbox, point in ring, point in geometry, sampled points for lake overlap |
| `basemap.ts` | reads `public/map/basemap.json` and places the raster on the map projection |
| `projection.ts` | Web Mercator projection and bounds for the SVG |
| `svg.ts` | GeoJSON geometry to SVG path with pixel simplification |

Consumers: `src/widgets/springs-map/MapSvg.astro` (static maps), `InteractiveMap.tsx` (zoom and
cards on `/map`), the home, region and district pages.

## Invariants

- `geo/` is the only data source. `src/` holds no `.geojson` files.
- `loadRegion` throws on a count mismatch between `index.geojson` and district files. Do not catch
  that to render a partial page.
- `Region.water` is `Lake[]`, sorted by area descending. `Lake.districts` holds slugs of districts
  the lake touches; it can be empty when boundaries are missing.
- `Region.sea` is `Sea[]`. The sea is a backdrop clipped to the region bbox plus a margin, so it
  deliberately exceeds the district bounds. A missing `sea.geojson` is allowed and yields `[]`.
- Chemistry is null for OSM points. Curated points with `coordinates_only` also have `water: null`.
- Projection bounds come from district geometries, not from points. Adding a lake does not move the
  map.
- The static maps render no client JavaScript. `/map` is the only page with a hydrated island.
- Map markers are pre-projected on the server. The island receives `x`, `y` and path strings and
  never re-projects.

## Change checklist

Adding a data field:

1. Add it to `types.ts` and to the loader mapping.
2. Add it to `references/formats.md` in `geo-region-assemble` and to the validator if it is required.
3. Pass it to the page or the island only when the UI uses it.
4. Run `npm test` and `npm run build`.

Adding a map layer:

1. Extend `MapSvg.astro` props and the layer order. The sea sits after the basemap and before the
   district fills, so district outlines and lakes stay on top.
2. Set `pointer-events: none` on reference layers so district links and point clicks still work, and
   `fill-rule="evenodd"` when the geometry carries holes.
3. Add a legend item and the attribution.
4. For the interactive map, pass precomputed paths and update `InteractiveMap.tsx`.

Changing the loader:

1. Keep the cache keyed by region slug.
2. Keep the fail-fast count checks.
3. Re-run the geo tests and the region validator.

## Script

Static guard for the domain:

```bash
node scripts/check-domain.mjs --project D:/docs/GitHub/vodaizrodnika
```

It checks module presence, expected exports, `Region.water`, `Region.sea`, lake attribution, the sea
layer wiring, the water base and highlight layers, the dashed district outline over water, the
viewport fit (`slice`, `MIN_SCALE`), point radii, basemap assets and placement, map props, page
wiring, the single client island and the absence of GeoJSON files in `src`. Exit 1 means a contract
broke.

The checks live in `lib/geo-domain.mjs` at the root of the skills repository. This skill only exposes
the CLI wrapper, so library code stays outside the skill directory.

The `data-geo-assembler` agent runs this check as the last stage of a data refresh.

## References

- `references/ts-domain.md` for types, loader behavior and page wiring.
- `references/map-layers.md` for projection, SVG layers and interaction.
