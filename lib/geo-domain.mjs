// Static guard for the geo TypeScript domain in the vodaizrodnika project.
// Pure checks live here; the skill script is only a CLI wrapper.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const read = (file) => readFileSync(file, "utf8");

const hasExport = (text, name) =>
  new RegExp(`export\\s+(?:async\\s+)?(?:function|const|type|interface|class)\\s+${name}\\b`).test(text) ||
  new RegExp(`export\\s*\\{[^}]*\\b${name}\\b`).test(text);

const collectGeoJson = (dir, out = []) => {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) collectGeoJson(full, out);
    else if (name.endsWith(".geojson")) out.push(full);
  }
  return out;
};

/** Declarations of the first rule whose selector matches `selector` (a regex source). */
const cssRule = (text, selector) => {
  const match = text.match(new RegExp(`${selector}[^{}]*\\{([^}]*)\\}`));
  return match ? match[1] : "";
};

/** Hex or rgb()/rgba() channels, so a muted red is still recognised as red. */
const colorChannels = (value) => {
  const hex = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const digits =
      hex[1].length === 3
        ? [...hex[1]].map((digit) => digit + digit).join("")
        : hex[1];
    return [0, 2, 4].map((offset) =>
      Number.parseInt(digits.slice(offset, offset + 2), 16),
    );
  }
  const rgb = value.match(/^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i);
  return rgb ? rgb.slice(1, 4).map(Number) : null;
};

/** Red dominant enough to read as red, including a red or danger design token. */
const isRed = (value) => {
  const channels = colorChannels(value.trim());
  if (!channels) return /var\(\s*--[\w-]*(?:red|danger|alert)/i.test(value);
  const [r, g, b] = channels;
  return r > g + 24 && r > b + 24;
};

/** Numeric value of a module constant, or NaN when the constant is gone. */
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

  const types = fileCheck("types.ts", "src/shared/lib/geo/types.ts");
  for (const name of ["Spring", "OsmSpring", "Lake", "Sea", "District", "Region", "MapPoint", "MultiPolygonGeometry", "AdministrativeCenter"]) {
    check(`types exports ${name}`, hasExport(types, name), name);
  }
  check("Region carries water", /water\s*:\s*Lake\[\]/.test(types), "Region.water: Lake[]");
  check("Region carries sea", /sea\s*:\s*Sea\[\]/.test(types), "Region.sea: Sea[]");
  check("Lake carries district slugs", /districts\s*:\s*string\[\]/.test(types), "Lake.districts: string[]");
  check("Region carries center", /center\s*:\s*AdministrativeCenter\s*\|\s*null/.test(types), "Region.center: AdministrativeCenter | null");
  check("Region carries outline", /outline\s*:\s*MultiPolygonGeometry\s*\|\s*null/.test(types), "Region.outline: MultiPolygonGeometry | null");

  const load = fileCheck("load.ts", "src/shared/lib/geo/load.ts");
  for (const name of ["listRegions", "loadRegion", "loadAllRegions", "getRegionSlugs", "districtPath", "springPath"]) {
    check(`load exports ${name}`, hasExport(load, name), name);
  }
  check("load reads water.geojson", /water\.geojson/.test(load), "water.geojson");
  check("load reads sea.geojson", /sea\.geojson/.test(load), "sea.geojson");
  check("load assigns lake districts", /geometryContains/.test(load), "geometryContains");
  check("load reads admin_center", /admin_center/.test(load), "admin_center");
  check("load reads region.geojson", /region\.geojson/.test(load), "region.geojson");
  check("region outline exists", existsSync(file("geo/leningrad-oblast/region.geojson")), "geo/leningrad-oblast/region.geojson");

  const contains = fileCheck("contains.ts", "src/shared/lib/geo/contains.ts");
  for (const name of ["bboxOfGeometry", "geometryContains", "sampleGeometryPoints", "pointInRing", "bboxIntersects"]) {
    check(`contains exports ${name}`, hasExport(contains, name), name);
  }

  const label = fileCheck("label.ts", "src/shared/lib/geo/label.ts");
  check("label exports geometryLabelPoint", hasExport(label, "geometryLabelPoint"), "geometryLabelPoint");

  const projection = fileCheck("projection.ts", "src/shared/lib/geo/projection.ts");
  for (const name of ["createProjection", "boundsOf"]) check(`projection exports ${name}`, hasExport(projection, name), name);

  const svg = fileCheck("svg.ts", "src/shared/lib/geo/svg.ts");
  check("svg exports geometryToPath", hasExport(svg, "geometryToPath"), "geometryToPath");

  const basemapLib = fileCheck("basemap.ts", "src/shared/lib/geo/basemap.ts");
  for (const name of ["loadBasemap", "placeBasemap"]) {
    check(`basemap exports ${name}`, hasExport(basemapLib, name), name);
  }
  check("basemap asset exists", existsSync(file("public/map/basemap.webp")), "public/map/basemap.webp");
  check("basemap meta exists", existsSync(file("public/map/basemap.json")), "public/map/basemap.json");
  check("basemap builder exists", existsSync(file("scripts/build-basemap.mjs")), "scripts/build-basemap.mjs");

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

  const island = fileCheck("InteractiveMap.tsx", "src/widgets/springs-map/InteractiveMap.tsx");
  check("island exports props", hasExport(island, "InteractiveMapProps"), "InteractiveMapProps");
  check("island renders points", /points\.map/.test(island), "points.map");
  check("island handles zoom", /wheel/.test(island), "wheel");
  check("island accepts basemap", /basemap\?:/.test(island), "basemap? prop");
  check("island labels districts", /districtLabel/.test(island), "districtLabel");
  check("island has a hover tooltip", /hoverTooltip/.test(island), "hoverTooltip");
  check("island clips the water highlight", /clipPath id=\{hoverClipId\}/.test(island), "hoverClipId");
  check("island accepts sea", /sea\?:/.test(island), "sea? prop");
  check("island accepts center", /center\?:/.test(island), "center? prop");
  check("island accepts outline", /outline\?:/.test(island), "outline? prop");
  check("island keeps water as texture", /waterBase/.test(island), "waterBase");
  check("island highlights the hovered district water", /waterActive/.test(island), "waterActive");
  check("island draws the region outline", /styles\.outline/.test(island), "styles.outline");
  check("island keeps hover over points", /elementsFromPoint/.test(island), "elementsFromPoint");
  check("island marks district hit areas", /data-district-slug/.test(island), "data-district-slug");
  check("island animates district focus", /focusDistrict/.test(island) && /animateView/.test(island), "focusDistrict");
  check("island focuses with requestAnimationFrame", /requestAnimationFrame/.test(island), "requestAnimationFrame");
  check("island focus scale", numericConstant(island, "FOCUS_SCALE") === 2.2, "FOCUS_SCALE = 2.2");
  check(
    "island fills the viewport",
    /preserveAspectRatio="xMidYMid slice"/.test(island),
    'preserveAspectRatio="xMidYMid slice"',
  );

  const minScale = numericConstant(island, "MIN_SCALE");
  check("island hides the map edge", minScale >= 1.05, `MIN_SCALE = ${Number.isNaN(minScale) ? "missing" : minScale}`);
  check("island keeps curated points clear", numericConstant(island, "CURATED_RADIUS") === 6, "CURATED_RADIUS = 6");
  check("island keeps OSM points clear", numericConstant(island, "OSM_RADIUS") === 3, "OSM_RADIUS = 3");

  const islandStyles = fileCheck("InteractiveMap.module.css", "src/widgets/springs-map/InteractiveMap.module.css");
  const outlineRule = cssRule(islandStyles, "\\.outline");
  check("region outline has a stroke", /stroke\s*:/.test(outlineRule), "outline stroke");
  const districtRule = cssRule(islandStyles, "\\.district");
  check("district borders are not drawn by default", /stroke\s*:\s*none/.test(districtRule), "district stroke none");
  check("island shows the map hint", /Карта родников/.test(island), "hint title");
  check("island hint is a complementary region", /<aside[\s\S]{0,200}aria-labelledby=\{hintId\}/.test(island), "<aside>");
  check("island hint has a dismiss control", /aria-label="Скрыть подсказку"/.test(island), "Скрыть подсказку");
  check("island hint stores dismissal", /vodaizrodnika:map-hint-dismissed/.test(island), "vodaizrodnika:map-hint-dismissed");
  check("island hint guards storage", /try\s*\{[\s\S]{0,120}localStorage/.test(island), "try/catch around localStorage");
  check(
    "island hint auto fades",
    /HINT_DELAY_MS\s*=\s*3000/.test(island) && /HINT_FADE_MS\s*=\s*700/.test(island),
    "3000 ms delay, 700 ms fade",
  );
  check(
    "island hint skips phones and touch",
    /HINT_MEDIA_QUERY\s*=\s*"\(max-width:\s*720px\),\s*\(pointer:\s*coarse\)"/.test(island),
    "(max-width: 720px), (pointer: coarse)",
  );
  check("hint overlay ignores pointers", /\.hintLayer\s*\{[^}]*pointer-events:\s*none/.test(islandStyles), "pointer-events: none");
  check("hint card takes pointers", /\.hint\s*\{[^}]*pointer-events:\s*auto/.test(islandStyles), "pointer-events: auto");
  check(
    "hint hidden by the media query",
    /@media\s*\(max-width:\s*720px\),\s*\(pointer:\s*coarse\)\s*\{[\s\S]{0,120}display:\s*none/.test(islandStyles),
    "display: none",
  );
  check(
    "hint respects reduced motion",
    /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*?\.hint\s*\{\s*transition:\s*none/.test(islandStyles),
    "no fade under prefers-reduced-motion",
  );

  const mapPage = fileCheck("map page", "src/pages/map.astro");
  check("map page uses the island", /InteractiveMap/.test(mapPage), "InteractiveMap");
  check("map page passes water", /water=\{water\}/.test(mapPage), "water={water}");
  check("map page passes sea", /sea=\{sea\}/.test(mapPage), "sea={sea}");
  check("map page passes center", /center=\{center\}/.test(mapPage), "center={center}");
  check("map page passes outline", /outline=\{outline\}/.test(mapPage), "outline={outline}");
  check("map page passes basemap", /basemap=\{basemap\}/.test(mapPage), "basemap={basemap}");
  check("map page is full height", /100dvh/.test(mapPage), "100dvh");
  check("map page uses bare layout", /bare/.test(mapPage), "bare");
  check("map page has no overlay", !/map-stage__overlay/.test(mapPage), "no overlay");
  check("map page has no notes", !/container notes/.test(mapPage), "no notes");
  check("map page has one client island", (mapPage.match(/client:/g) ?? []).length === 1, "client:load");

  const layout = fileCheck("BaseLayout.astro", "src/app/layouts/BaseLayout.astro");
  check("layout supports bare pages", /bare\?:/.test(layout), "bare? prop");

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
