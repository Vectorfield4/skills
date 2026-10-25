# Geo file formats

The dataset is one folder per region under `geo/<region>/`. A region has one folder per district.
`src/` never stores a copy of this data.

## Layout

```
geo/<region>/
  area.md
  authoritative-sources.json
  index.geojson
  region.geojson
  boundaries.geojson
  osm-springs.geojson
  water.geojson
  sea.geojson
  <district>/
    area.md
    springs.geojson
    osm-springs.geojson
```

## `index.geojson`

FeatureCollection, one Feature per district.

Collection fields: `type`, `name`, `region`, `region_type`, `admin_subject`, `admin_center`,
`generated`, `description`, `count`, `features`.

`admin_center` is optional. It describes the seat of the subject, not a district:

| Field | Meaning |
|---|---|
| `name` | Russian name of the city |
| `lon`, `lat` | WGS84 point, finite numbers |
| `osm_type` | `node`, `way` or `relation` when known |
| `osm_id` | OSM id when known |
| `source` | attribution, for example `OpenStreetMap` |

The center can sit outside every district polygon, because an administrative center is often a
separate federal subject (Санкт-Петербург inside Ленинградская область). Its point still has to fall
inside the collection bounds, so the map can draw it. Rebuilding the index keeps the existing object.

Feature fields:

| Field | Meaning |
|---|---|
| `id` | district slug |
| `geometry` | district boundary, or a bbox polygon, or null |
| `properties.district` | Russian district name |
| `properties.district_slug` | folder name |
| `properties.district_type` | municipal district, municipal okrug, city district, city okrug |
| `properties.admin_subject` | federal subject |
| `properties.springs_count` | number of curated points |
| `properties.springs_path` | `<district>/springs.geojson` |
| `properties.area_md` | `<district>/area.md` |
| `properties.geometry_basis` | `osm_admin_boundary` or `springs_extent_bbox` |
| `properties.bbox`, `centroid` | extent of curated springs, not of the boundary |
| `properties.osm_relation_id` | OSM relation of the district boundary; omitted or null when there is no boundary |
| `properties.osm_springs_count` | number of OSM nodes |
| `properties.osm_springs_path` | path or null when count is 0 |

`bbox` and `centroid` describe the curated points. When there are no curated points they are null.
The boundary lives in `geometry`. When no boundary was loaded, `geometry` is a rectangle around the
curated extent and `geometry_basis` says so.

## `springs.geojson`

FeatureCollection of Points. Coordinates are `[lon, lat]`, WGS84.

Properties: `id`, `name`, `region`, `district`, `district_slug`, `district_type`, `admin_subject`,
`locality`, `address`, `water`, `sanpin_2_1_4_1175_02`, `sanpin_comment`, `flags`,
`data_completeness`, `status`, `note`, `source`, `confidence`.

- `water` is an object for `coordinates+chemistry`, null or an all-null object for `coordinates_only`.
- `water` keys: `mineralization_mg_l`, `hardness_deg_g`, `ph`, `nitrates_mg_l`, `chlorides_mg_l`,
  `class` with `mineralization`, `hardness`, `ph`.
- `data_completeness` is `coordinates+chemistry` or `coordinates_only`.
- `confidence` is `high`, `medium` or `low`.
- `id` is unique inside the region and is the slug of the source page.

## `osm-springs.geojson`

Same Point format, poorer properties. Chemistry is always null.

Properties: `id` (`osm-node-<id>`), `osm_id`, `osm_type` (`node`), `name` (nullable), district
fields, `tags`, `water: null`, `sanpin_2_1_4_1175_02: null`, `flags: []`,
`data_completeness: "coordinates_only"`, `status`, `source` (URL `https://www.openstreetmap.org/node/<id>`),
`confidence: "low"`.

`tags` keeps only useful OSM keys: `drinking_water`, `seasonal`, `intermittent`, `access`,
`description`, `covered`, `basin`, `bottle`, `water_characteristics`, `ref`, `operator`,
`opening_hours`, `foot`, `dog`, `wheelchair`.

## `boundaries.geojson`

FeatureCollection of MultiPolygons, one per district. `id` equals `district_slug`. Properties:
`district`, `district_slug`, `district_type`, `admin_subject`, `osm_relation_id`,
`osm_admin_level: 6`, `source`. Rings are closed. Inner rings are holes.

## `region.geojson`

FeatureCollection with one MultiPolygon: the outer boundary of the subject from OSM
`admin_level=4`. Fields: `name`, `region`, `source`, `license`, `generated`, `count`, and one
feature with `properties.name`, `osm_relation_id`, `osm_admin_level: 4`, `source`.

The map uses this file only for the outer outline. District borders are not drawn by default. If the
file is missing, the map renders no outer border.

## `water.geojson`

FeatureCollection of MultiPolygons for lakes from 1 km². This is a map reference layer, not a spring
layer.

Properties: `name` (nullable), `osm_id`, `osm_type` (`way` or `relation`), `area_km2`. Collection
fields include `min_area_km2`, `license`, `retrieved`, `source`. District attribution is computed at
load time by the site, because one lake can touch several districts.

## `sea.geojson`

FeatureCollection with one Feature for the sea around the region. It is a map backdrop, not a spring
layer, and it never mixes with the OSM lakes.

| Field | Meaning |
|---|---|
| `name` | collection label, for example `Моря: Ленинградская область` |
| `region` | region slug |
| `source` | `Natural Earth 1:10m Ocean` |
| `license` | `Public domain` |
| `generated` | date the file was built |
| `bbox` | clip box: the region bbox plus `--margin` |
| `count` | 1 |
| `features[0].id` | `baltic-sea` |
| `features[0].geometry` | MultiPolygon; land and islands are holes |
| `features[0].properties.name` | Russian sea name |
| `features[0].properties.kind` | always `sea` |
| `features[0].properties.source`, `license` | repeated per feature for consumers that read only properties |

Rings are clipped to the expanded region bbox with Sutherland-Hodgman, so the sea reaches the map
edge. Holes survive clipping: the ocean polygon keeps land and islands as holes, and the renderer
needs `fill-rule="evenodd"` to draw water and leave land empty. A disjoint result stays one
MultiPolygon. Coordinates are rounded to five decimals and rings are simplified at `--tolerance`
degrees (default 0.002).

## `area.md` and `authoritative-sources.json`

`area.md` exists at region and district level. It is prose, not generated data. Loader sections
(`## Как устроена папка`, `## Файлы`, `## Точки`, `## Районы`, `## OSM-слой`) are stripped on the site.

`authoritative-sources.json` lists sources with `id`, `name`, `url`, `type`, `coverage`,
`provides`, `reliability` (`high`, `medium`, `low`), `reliability_note`, `caveats`, `license`,
`checked`.

## Invariants

- `count` equals `features.length` in every collection.
- Index counts equal the district file counts.
- Curated and OSM layers never mix.
- Coordinates are finite and inside the region bounds with a one degree tolerance. The sea layer is
  the exception: it is clipped to the region bbox plus a margin and deliberately exceeds the bounds.
- All OSM-derived files keep `ODbL 1.0, © OpenStreetMap contributors`.
- `sea.geojson` keeps `Public domain` and the Natural Earth source in the collection and in the
  feature properties.
