# Geo sources

Every fact in `geo/` comes from a source that is written down. This reference covers what to look
for and how to judge it before asking the assembly skill to write anything.

## Source types

| Type | Examples | Use |
|---|---|---|
| catalog | Аква Академия, h2o-institute.com | coordinates and chemistry, one page per spring |
| reference | svyato.info | coordinates, names, locality, no chemistry |
| open data | OpenStreetMap / Overpass | springs, boundaries, lakes, rivers |
| map | Yandex.Maps, 2GIS | cross-check coordinates and access, no chemistry |
| official | ВСЕГЕИ, Роспотребнадзор, lenobl.ru | hydrogeology, СанПиН, administrative status |

## What a source must provide before it enters `authoritative-sources.json`

- stable URL and page structure;
- coordinates in WGS84, or a documented conversion from degrees and minutes;
- what the source measures and what it does not;
- reliability: `high`, `medium` or `low`, with one sentence why;
- caveats: outdated data, user-submitted points, no microbiology, missing protocol;
- license or terms, and whether facts may be reused.

## OSM lookup

`find-osm-region.mjs` resolves the region relation through Nominatim, then reads relation tags
through Overpass. The region area id is `3600000000 + relation_id`. Do not guess it.

District boundaries use `boundary=administrative` and `admin_level=6`. Springs use
`natural=spring` and `waterway=spring`. Lakes use `natural=water` and `water=lake`.

## Probing

`probe-sources.mjs` checks HTTP reachability, final URL, content type and charset. It is not a
content parser. A 200 response with a login wall or an empty shell is still unusable.

Overpass coverage counts are a sanity check, not a promise: the public instance changes, and a
mirror may return 200 with zero elements for an area query. If a count is zero, retry a different
mirror before concluding that the region has no objects.

## Licenses

- OSM and all derived files: ODbL 1.0, keep `© OpenStreetMap contributors`.
- Sentinel-2 cloudless 2016: CC BY 4.0, keep the EOX attribution.
- Catalogs and reference sites: facts may be reused, texts may not. Each point keeps a link to the
  original page.
- Official documents: quote with a link; do not copy whole pages.

## Output of the search skill

The search skill returns candidates and probe results. It does not choose a source for the dataset
and does not write `geo/`. A human decides which sources are good enough, then the assembly skill
runs with that decision recorded in `authoritative-sources.json`.
