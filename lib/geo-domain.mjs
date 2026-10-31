// Static guard for the geo TypeScript domain in the vodaizrodnika project.
// Pure checks live here; the skill script is only a CLI wrapper.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const read = (file) => readFileSync(file, "utf8");

const hasExport = (text, name) =>
  new RegExp(`export\\s+(?:async\\s+)?(?:function|const|type|interface|class)\\s+${name}\\b`).test(text) ||
  new RegExp(`export\\s*\\{[^}]*\\b${name}\\b`).test(text) ||
  new RegExp(`export\\s+type\\s*\\{[^}]*\\b${name}\\b`).test(text);

const collectGeoJson = (dir, out = []) => {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) collectGeoJson(full, out);
    else if (name.endsWith(".geojson")) out.push(full);
  }
  return out;
};

const numericConstant = (text, name) => {
  const match = text.match(new RegExp(`\\b${name}\\s*=\\s*([\\d.]+)`));
  return match ? Number(match[1]) : Number.NaN;
};

export function checkGeoDomain(project = process.cwd()) {
  const root = path.resolve(project);
  const checks = [];

  const check = (id, ok, detail = "") => checks.push({ id, ok: Boolean(ok), detail });
  const file = (relative) => path.join(root, relative);
  const fileCheck = (id, relative) => {
    const exists = existsSync(file(relative));
    check(id, exists, exists ? relative : `missing ${relative}`);
    return exists ? read(file(relative)) : "";
  };

  // types.ts
  const types = fileCheck("types.ts", "src/shared/lib/geo/types.ts");
  for (const name of [
    "Spring", "OsmSpring", "Lake", "Sea", "District", "Region", "MapPoint",
    "MultiPolygonGeometry", "AdministrativeCenter", "Road", "RoadTier",
    "MultiLineStringGeometry", "Locality",
  ]) {
    check(`types exports ${name}`, hasExport(types, name), name);
  }
  check("Region carries water", /water\s*:\s*Lake\[\]/.test(types), "Region.water: Lake[]");
  check("Region carries sea", /sea\s*:\s*Sea\[\]/.test(types), "Region.sea: Sea[]");
  check("Region carries roads", /roads\s*:\s*Road\[\]/.test(types), "Region.roads: Road[]");
  check("Region carries center", /center\s*:\s*AdministrativeCenter\s*\|\s*null/.test(types), "Region.center");
  check("Region carries outline", /outline\s*:\s*MultiPolygonGeometry\s*\|\s*null/.test(types), "Region.outline");
  check("Region carries localities", /localities\s*:\s*Locality\[\]/.test(types), "Region.localities");
  check("Lake carries district slugs", /districts\s*:\s*string\[\]/.test(types), "Lake.districts");

  // load.ts
  const load = fileCheck("load.ts", "src/shared/lib/geo/load.ts");
  for (const name of [
    "listRegions", "loadRegion", "loadAllRegions", "getRegionSlugs",
    "districtPath", "springPath", "deriveLocalities",
  ]) {
    check(`load exports ${name}`, hasExport(load, name), name);
  }
  check("load reads water.geojson", /water\.geojson/.test(load), "water.geojson");
  check("load reads sea.geojson", /sea\.geojson/.test(load), "sea.geojson");
  check("load reads region.geojson", /region\.geojson/.test(load), "region.geojson");
  check("load reads roads.geojson", /roads\.geojson/.test(load), "roads.geojson");
  check("load assigns lake districts", /geometryContains/.test(load), "geometryContains");
  check("load reads admin_center", /admin_center/.test(load), "admin_center");
  check("region outline exists", existsSync(file("geo/leningrad-oblast/region.geojson")), "geo/leningrad-oblast/region.geojson");

  // contains.ts
  const contains = fileCheck("contains.ts", "src/shared/lib/geo/contains.ts");
  for (const name of ["bboxOfGeometry", "geometryContains", "sampleGeometryPoints", "pointInRing", "bboxIntersects"]) {
    check(`contains exports ${name}`, hasExport(contains, name), name);
  }

  // label.ts
  const label = fileCheck("label.ts", "src/shared/lib/geo/label.ts");
  check("label exports geometryLabelPoint", hasExport(label, "geometryLabelPoint"), "geometryLabelPoint");
  check("label exports geometryArea", hasExport(label, "geometryArea"), "geometryArea");

  // projection.ts
  const projection = fileCheck("projection.ts", "src/shared/lib/geo/projection.ts");
  for (const name of ["createProjection", "boundsOf"]) check(`projection exports ${name}`, hasExport(projection, name), name);

  // svg.ts
  const svg = fileCheck("svg.ts", "src/shared/lib/geo/svg.ts");
  check("svg exports geometryToPath", hasExport(svg, "geometryToPath"), "geometryToPath");

  // basemap.ts
  const basemapLib = fileCheck("basemap.ts", "src/shared/lib/geo/basemap.ts");
  for (const name of ["loadBasemap", "placeBasemap"]) {
    check(`basemap exports ${name}`, hasExport(basemapLib, name), name);
  }
  check("basemap asset exists", existsSync(file("public/map/basemap.webp")), "public/map/basemap.webp");
  check("basemap meta exists", existsSync(file("public/map/basemap.json")), "public/map/basemap.json");
  check("basemap builder exists", existsSync(file("scripts/build-basemap.mjs")), "scripts/build-basemap.mjs");

  // new geo modules
  const newModules = {
    "dedupe.ts": "src/shared/lib/geo/dedupe.ts",
    "district-labels.ts": "src/shared/lib/geo/district-labels.ts",
    "locality-labels.ts": "src/shared/lib/geo/locality-labels.ts",
    "map-group.ts": "src/shared/lib/geo/map-group.ts",
    "scale.ts": "src/shared/lib/geo/scale.ts",
    "stitch.ts": "src/shared/lib/geo/stitch.ts",
    "tolerance.ts": "src/shared/lib/geo/tolerance.ts",
  };
  for (const [name, relative] of Object.entries(newModules)) {
    const text = fileCheck(name, relative);
    // minimal presence check only; exports vary
    check(`${name} present`, Boolean(text), relative);
  }
  const dedupe = read(file("src/shared/lib/geo/dedupe.ts"));
  check("dedupe exports dropDuplicateSprings", hasExport(dedupe, "dropDuplicateSprings"), "dropDuplicateSprings");
  const districtLabels = read(file("src/shared/lib/geo/district-labels.ts"));
  check("district-labels exports placeDistrictLabels", hasExport(districtLabels, "placeDistrictLabels"), "placeDistrictLabels");
  const localityLabels = read(file("src/shared/lib/geo/locality-labels.ts"));
  check("locality-labels exports placeLocalityLabels", hasExport(localityLabels, "placeLocalityLabels"), "placeLocalityLabels");
  const mapGroup = read(file("src/shared/lib/geo/map-group.ts"));
  check("map-group exports loadMapGroup", hasExport(mapGroup, "loadMapGroup"), "loadMapGroup");
  check("map-group exports listMapGroups", hasExport(mapGroup, "listMapGroups"), "listMapGroups");
  const scale = read(file("src/shared/lib/geo/scale.ts"));
  check("scale exports unitsPerMeterAtEquator", hasExport(scale, "unitsPerMeterAtEquator"), "unitsPerMeterAtEquator");
  const stitch = read(file("src/shared/lib/geo/stitch.ts"));
  check("stitch exports stitchLines", hasExport(stitch, "stitchLines"), "stitchLines");
  const tolerance = read(file("src/shared/lib/geo/tolerance.ts"));
  check("tolerance exports polygonTolerance", hasExport(tolerance, "polygonTolerance"), "polygonTolerance");
  check("tolerance exports roadTolerance", hasExport(tolerance, "roadTolerance"), "roadTolerance");

  // MapSvg.astro
  const mapSvg = fileCheck("MapSvg.astro", "src/widgets/springs-map/MapSvg.astro");
  check("MapSvg accepts water", /water\?:/.test(mapSvg), "water? prop");
  check("MapSvg accepts sea", /sea\?:/.test(mapSvg), "sea? prop");
  check("MapSvg accepts center", /center\?:/.test(mapSvg), "center? prop");
  check("MapSvg accepts basemap", /basemap\?:/.test(mapSvg), "basemap? prop");
  check("MapSvg accepts outline", /outline\?:/.test(mapSvg), "outline? prop");
  check("MapSvg styles lakes", /map__lake/.test(mapSvg), "map__lake");
  check("MapSvg styles the sea", /map__sea/.test(mapSvg), "map__sea");
  check("MapSvg renders a water base layer", /map__water-base/.test(mapSvg), "map__water-base");
  check("MapSvg renders the region outline", /map__outline/.test(mapSvg), "map__outline");
  check("MapSvg styles the center marker", /map__center/.test(mapSvg), "map__center");

  // InteractiveMap and new map modules
  const island = fileCheck("InteractiveMap.tsx", "src/widgets/springs-map/InteractiveMap.tsx");
  check("island file present", Boolean(island), "InteractiveMap.tsx");

  const mapTypes = fileCheck("map/types.ts", "src/widgets/springs-map/map/types.ts");
  check("map types exports InteractiveMapProps", hasExport(mapTypes, "InteractiveMapProps"), "InteractiveMapProps");
  check("map types exports MapPointTuple", hasExport(mapTypes, "MapPointTuple"), "MapPointTuple");

  const mapConstants = fileCheck("map/constants.ts", "src/widgets/springs-map/map/constants.ts");
  check("map constants CURATED_RADIUS", numericConstant(mapConstants, "CURATED_RADIUS") === 6, "CURATED_RADIUS = 6");
  check("map constants OSM_RADIUS", numericConstant(mapConstants, "OSM_RADIUS") === 3, "OSM_RADIUS = 3");
  check("map constants MIN_SCALE", numericConstant(mapConstants, "MIN_SCALE") >= 1, "MIN_SCALE");
  check("map constants FOCUS_SCALE", numericConstant(mapConstants, "FOCUS_SCALE") === 2.2, "FOCUS_SCALE = 2.2");

  // map pages / layout
  const mapLayout = fileCheck("MapLayout.astro", "src/app/layouts/MapLayout.astro");
  check("map layout uses island", /InteractiveMap/.test(mapLayout), "InteractiveMap");
  check("map layout has client island", /client:load/.test(mapLayout), "client:load");

  const mapIndex = fileCheck("map index page", "src/pages/map/index.astro");
  check("map index page exists", Boolean(mapIndex), "src/pages/map/index.astro");
  const mapSlug = fileCheck("map slug page", "src/pages/map/[slug].astro");
  check("map slug page exists", Boolean(mapSlug), "src/pages/map/[slug].astro");

  // pages wiring for region/district still uses region water/sea/center/outline
  const home = fileCheck("home page", "src/pages/index.astro");
  check("home passes water", /water=\{region\.water\}/.test(home), "water={region.water}");
  check("home passes sea", /sea=\{region\.sea\}/.test(home), "sea={region.sea}");
  check("home passes center", /center=\{region\.center\}/.test(home), "center={region.center}");
  check("home passes outline", /outline=\{region\.outline\}/.test(home), "outline={region.outline}");

  const regionPage = fileCheck("region page", "src/pages/[region]/index.astro");
  check("region page passes water", /water=\{region\.water\}/.test(regionPage), "water={region.water}");
  check("region page passes sea", /sea=\{region\.sea\}/.test(regionPage), "sea={region.sea}");
  check("region page passes center", /center=\{region\.center\}/.test(regionPage), "center={region.center}");
  check("region page passes outline", /outline=\{region\.outline\}/.test(regionPage), "outline={region.outline}");

  const districtPage = fileCheck("district page", "src/pages/[region]/[district]/index.astro");
  check("district page passes water", /water=\{region\.water\}/.test(districtPage), "water={region.water}");
  check("district page passes sea", /sea=\{region\.sea\}/.test(districtPage), "sea={region.sea}");
  check("district page passes center", /center=\{region\.center\}/.test(districtPage), "center={region.center}");
  check("district page passes outline", /outline=\{region\.outline\}/.test(districtPage), "outline={region.outline}");

  const layout = fileCheck("BaseLayout.astro", "src/app/layouts/BaseLayout.astro");
  check("layout supports bare pages", /bare\?:/.test(layout), "bare? prop");

  const geoFiles = existsSync(path.join(root, "src")) ? collectGeoJson(path.join(root, "src")) : [];
  check("no geo data duplicated in src", geoFiles.length === 0, geoFiles.join(", "));

  const failed = checks.filter((entry) => !entry.ok);
  return {
    project: root,
    checks: checks.length,
    failed: failed.length,
    failures: failed,
    status: failed.length === 0 ? "ok" : "fail",
  };
}