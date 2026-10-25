# Basemap texture

The schematic maps can sit on a light raster underlay. The vector layers stay on top, so district
borders, the sea, lakes and points remain the readable content.

## Source

Sentinel-2 cloudless 2016, served by EOX as WMTS tiles:

```
https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/{z}/{y}/{x}.jpg
```

License: CC BY 4.0. Required attribution:

```
Sentinel-2 cloudless - https://s2maps.eu by EOX IT Services GmbH
(Contains modified Copernicus Sentinel data 2016)
```

The 2018 to 2025 layers are CC BY-NC-SA 4.0. Do not use them for a commercial site. The 2016 layer
is the safe default. Terrain tiles from Mapzen are an alternative when relief matters more than
land cover.

## Builder

The builder lives in the project, not in this skill, because it uses the project's `sharp`
dependency:

```bash
npm run basemap
# or
node scripts/build-basemap.mjs --region leningrad-oblast --zoom 9 --width 2400 --quality 72
```

Flags:

| Flag | Default | Meaning |
|---|---|---|
| `--region` | `leningrad-oblast` | folder under `geo/` used for the bbox |
| `--zoom` | `9` | source tile zoom |
| `--width` | `2400` | output width in pixels |
| `--quality` | `72` | WebP quality |
| `--margin` | `0.06` | degrees of padding around the region bbox |
| `--brightness` | `1.2` | lighten for map readability |
| `--saturation` | `0.8` | desaturate before the cream veil |
| `--veil` | `0.24` | cream overlay opacity |
| `--layer` | `s2cloudless_3857` | EOX layer name |

The builder downloads roughly 140 tiles at z9, assembles them in Web Mercator, lightens and
desaturates the mosaic, and writes:

- `public/map/basemap.webp`, about 150 to 250 KB;
- `public/map/basemap.json` with `href`, `bbox`, size, source, license and attribution.

Tiles are not stored in the repository.

## Placement

`basemap.json` carries the geographic bbox of the mosaic. `src/shared/lib/geo/basemap.ts` projects
that bbox with the same `createProjection` used by the vector layers, so the raster aligns at any
map width and height:

```ts
const meta = loadBasemap();
const placement = meta ? placeBasemap(meta, project) : null;
```

`MapSvg.astro` accepts `basemap={meta}` and renders an `<image>` before the district fills.
`InteractiveMap.tsx` accepts the projected placement and renders the image first inside the SVG.

## Layer order

1. raster basemap;
2. sea polygons, under district outlines, with an even-odd fill and a slightly deeper blue than
   lakes;
3. district fills with low opacity;
4. lakes with an almost opaque pastel fill, so administrative borders crossing the water do not
   show through as white spokes;
5. district outlines;
6. spring points and cards.

The sea is drawn before districts and lakes, so district outlines stay on top of it and lakes keep
their own shallower blue. It has no stroke and ignores pointer events, and `fill-rule="evenodd"`
keeps the land and island holes empty. Natural Earth is public domain, but the maps still name
`Natural Earth 1:10m Ocean` next to the OSM credit.

The credit line is part of the map UI: the static maps render it in the legend, the interactive map
renders a small link in the bottom right corner.

## Refresh

Run `npm run basemap` when the region bbox changes or when a newer licensed layer becomes available.
The script downloads tiles every run; there is no cache. Keep the output WebP under about 500 KB.
