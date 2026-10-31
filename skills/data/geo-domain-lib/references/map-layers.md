# Map layers and interaction

Two renderers share one projection contract and one layer order.

## Projection

`createProjection(geometries, width, height, padding)` uses Web Mercator on longitude and latitude,
takes bounds from district geometries, and fits them with padding. Points are projected with the
same function. Never project lakes or points against their own bounds, or layers drift apart.

`geometryToPath(geometry, project, tolerance)` converts rings to SVG path commands and simplifies
closed rings in screen pixels. The tolerance is in pixels, typically 0.6 to 1.1. It is not degrees.

## Static renderer

`MapSvg.astro` is server-only. Layer order:

1. the sea, `map__sea` with `map__water-base` on every fill, `pointer-events: none`,
   `fill-rule="evenodd"`; it sits under district outlines and lakes;
2. district fills and links, no internal strokes;
3. lakes, `map__lake` with `map__water-base`, `pointer-events: none`;
4. the outer region outline, `map__outline` over `map__outline-shadow`, `pointer-events: none`;
5. the administrative center star and label, `pointer-events: none`;
6. points, curated at r=6 and OSM at r=3, the same pair the island uses;
7. legend.

Under the basemap the `map__water-base` rule turns water into a 6% wash with a faint shoreline, so
the satellite image reads through it. Without the basemap the sea and lakes keep their blue fills.
Hovering a district link adds a light 12% tint instead of flooding the shape with color. District
links stay clickable because the sea, water and outline layers ignore pointers. Titles give district,
sea and lake names. The map carries the OSM and Natural Earth attribution in the page copy.

## Interactive renderer

`/map` uses `InteractiveMap.tsx` with React and `client:load`. The server still renders the full SVG,
so the page has a usable map before hydration.

The island receives:

- `width`, `height`, viewBox size;
- `districts` with path, slug, name, href, spring count, label point;
- `sea` with path and name, drawn after the raster and before the districts;
- `water` is empty on first paint; lakes arrive from `waterHref` (`/map/<slug>/water.json`);
- `roads` with tier and path;
- `points` as tuples (id, x, y, kind, name, lon, lat, href, district index, locality, chemistry, status, flagged);
- `vendorPoints` with badge position, type, href, price, city;
- `localityLabels` with name, x, y, weight;
- `center` with `name`, `x`, `y`, or null;
- `outline` with the projected path of `region.geojson`, or null;
- `basemap`, `basemapVariants`, `unitsPerMeter`, `centerLat`;
- `regions` selector options for the map group.

The island does not know about GeoJSON, projection or the file system.

Behavior:

- the sea group follows the basemap image, ignores pointer events and uses `fillRule="evenodd"`;
- district fills carry no stroke; the outer `outline` path is the only border drawn by default;
- district hover is resolved with `document.elementsFromPoint` and `data-district-slug`, so moving
  over a spring point or its label keeps the district active instead of clearing it;
- clicking a district animates the view to its label point over 600 ms; at minimum zoom it also
  zooms to 2.2, and at a higher zoom it keeps the current scale and only centers;
- wheel zoom anchored at the cursor, native non-passive listener;
- `+`, `-` and reset controls;
- pinch zoom and two-finger pan;
- pointer drag pan with a 5 px click threshold;
- click or Enter/Space on a marker opens a card;
- Escape, the close button or a background tap closes it;
- marker radius is divided by scale so dots keep their screen size, with curated at 6 and OSM at 3;
- the viewBox is clamped to the data box, scale `MIN_SCALE` to 20.

The stage is filled at any aspect ratio. The SVG uses `preserveAspectRatio="xMidYMid slice"` and
`MIN_SCALE = 1.08`, so the default view is cropped by 8% and the edge of the data box never shows.
Panning still works: the view stays inside the data box at every scale, and zoom out stops at
`MIN_SCALE`, not at a full fit.

Layout:

- `/map` uses `BaseLayout` with `bare`, so the header and footer are not rendered;
- the stage is `100dvh`, full bleed, with no page chrome and no info panel;
- controls sit top-right;
- the card is bottom-left on desktop and a bottom sheet below 720 px;
- only the map, its controls and the small attribution line stay on screen.

## Water layers

Both renderers treat water as texture first and highlight second.

- Base layer. The sea and lakes draw in a pale wash: `waterBase` in the island, `map__water-base` in
  `MapSvg`. The island renders the wash at 6% fill with a faint shoreline, so district geometry and
  labels read through. `MapSvg` applies the same wash only under the basemap and keeps the plain blue
  fills when there is no raster.
- Highlight. The island repeats the sea and lake paths with `waterActive` in a group clipped to the
  hovered district path. Only the water inside that district turns blue, at 10% fill, and the
  highlight leaves with the hover. The static map has no hover repaint of water: it keeps the base
  layer.
- Outer outline. `region.geojson` becomes the only default border. The island draws
  `styles.outline` over `styles.outlineShadow`; `MapSvg` draws `map__outline` over
  `map__outline-shadow`. District paths have no stroke, so internal borders do not appear on land or
  on water.

The outline is a reference layer: it never takes a pointer.

## Administrative center

The region's seat comes from `index.geojson` as `admin_center`, is projected with the same
`project`, and is never a link. Both renderers draw a small five-point star with the city name next
to it, both with a white halo (`paint-order: stroke`, stroke 2 to 3), so the marker reads over the
satellite basemap and over translucent district fills.

The point can sit outside every district polygon: an administrative center can be a separate federal
subject, as Санкт-Петербург is for Ленинградская область. It still has to fall inside the collection
bounds, because the projection fits districts only.

In the interactive renderer the star radius, label font size and label offset are divided by
`view.scale`, so the marker keeps a constant screen size while zooming. The group ignores pointer
events, so it never blocks panning or a spring click. Layer order puts it above lakes and points.
`MapSvg` also adds the legend item "Административный центр" when a center exists.

## Map groups

Maps are built by groups spanning one or more regions (`src/shared/config/map-groups.ts`).
A district key is `region:slug`, a point key is `region:id`. The projection is computed
over the union of all district geometries in the group, so points from different regions
share one coordinate system.

`validateMapGroups` ensures: no empty groups, no duplicate slugs, no slug colliding with
a region name, every region exists, no region in two groups.

## Roads layer

Decorative only. Each tier (`major`, `minor`) is one merged `MultiLineString`.
Roads are stitched into chains (`stitchLines`) before simplification, so a single
tolerance pass removes most vertices. Tolerance grows with region count (`roadTolerance`).

## Vendor layer

Companies are projected by the same function as springs but never enter `points`.
They render as warm badges above the spring layer. Only `coords.precision: exact`
gets a point; `district` and `city` precision stay point-less.

## Clustering

Points closer than `CLUSTER_RADIUS_PX` (54 CSS px) at the current scale merge into
a numbered bubble. A pair never becomes a bubble (minimum three). The first frame
is clustered on the server using `NOMINAL_VIEWPORT` (1440×900). The true center
stays in `anchorX/anchorY`; the bubble is drawn with an edge offset but does not
move the group.

## Lazy water

Lake geometry is not in the page props. It arrives from `/map/<slug>/water.json`
on the first water toggle. Only the sea backdrop ships with the page.

## Locality and district labels

Settlement labels come from `region.localities` (derived from curated springs).
District labels use `geometryLabelPoint` and avoid collisions via `placeDistrictLabels`.
Labels keep a constant screen size at any zoom.

## Scale bar

`unitsPerMeterAtEquator` + `pickScaleBar` produce a bar whose length is a round
number of metres at the region's latitude.

## Basemap layer

The optional raster underlay sits below every vector layer. It is a Web Mercator mosaic described by
`public/map/basemap.json`; `basemap.ts` projects its bbox with the same function as districts, so it
aligns at any size.

Rules:

- district fills become translucent so land cover shows through;
- the sea and lakes drop to a 6% `map__water-base` wash, so the satellite water still reads and the
  water texture never hides the coastline;
- the sea keeps `fill-rule="evenodd"`, so land and island holes stay empty;
- district outlines over water use the muted red dashed line from the water layers section, so OSM
  borders crossing Ladoga and Chudskoye no longer look like white spokes;
- the EOX attribution stays visible in the map UI;
- the raster is one WebP, not tiles, and stays under roughly 500 KB;
- the builder is project-local because it uses `sharp`.

## District labels and hover

The interactive map labels every district at a point inside its geometry. `geometryLabelPoint` in
`src/shared/lib/geo/label.ts` uses the largest polygon centroid, then the bbox center, then the first
ring point. Labels use short names (the type suffix is removed), stay at 11 px on screen at any zoom,
and have a white halo so they read over the satellite underlay.

Hover is deliberately quiet: the district gets a faint translucent tint and a thin accent outline,
not a solid fill, so the water highlight, the labels and the larger points stay readable. The same
hover raises a bottom-center tooltip with the full district name and the label point coordinates.
The tooltip is a status line, not a card, and disappears when the pointer leaves or a pan starts.

Water outside the districts follows the sea backdrop. The sea polygon covers the region bbox plus a
margin, and its base wash is pale enough not to compete with the land. Only the highlight is clipped
to the hovered district path, so the open sea never turns solid blue. Lakes stay unclipped because
they belong to districts.

## Transient hint

The fullscreen `/map` page has no overlay block, but it carries one small onboarding card,
"Карта родников", rendered by the island above the SVG at the top left, below the safe area. It is
an `<aside>` with a close button (`aria-label="Скрыть подсказку"`), not a dialog. Its wrapper ignores
pointer events so only the card rectangle takes clicks. The card hides itself 3 seconds after mount
with an opacity fade of about 700 ms, the `prefers-reduced-motion` path skips the fade, and the nodes
leave the DOM afterwards. The automatic fade writes nothing. The close button writes
`vodaizrodnika:map-hint-dismissed=1` to `localStorage` (reads and writes wrapped in try/catch, the
flag is read after mount, never during SSR), and a stored flag suppresses the card on later visits.
Below 720 px and on coarse pointers the card is not rendered and the timer is not started.

## Accessibility and performance

- markers are focusable groups with `role="button"`, `aria-label`, `aria-expanded`;
- the card is a labelled dialog with a close button and focus return;
- the hint is a complementary region with a keyboard reachable close button;
- controls are a labelled fieldset;
- `prefers-reduced-motion` removes marker transitions;
- the static page ships no JavaScript for maps other than `/map`;
- path strings are precomputed, so zoom and pan only change the viewBox.

## Constraints

- No tiles, no external map keys, no client-side geodata fetch.
- Lakes and the sea are reference geometry, not a hydrology claim. Keep the text that says the map
  is schematic.
- OSM data is ODbL. Keep `© OpenStreetMap contributors` visible on any page with boundaries, lakes
  or OSM springs. The sea is Natural Earth 1:10m Ocean, public domain; keep its name next to the OSM
  credit.
