#!/usr/bin/env node
// Runs the geo assembly stages in order and prints ONE JSON manifest.
//
// Every stage is a sibling script and stays runnable on its own. This file only
// sequences them: it stops on the first non-zero exit, it writes no data itself and
// it keeps stdout for the manifest, so a caller parses one object while the stages'
// progress lines stay on stderr.
//
// Two stages are not siblings: `scout` resolves the region through `find-osm-region.mjs`
// (`geo-source-search`) and `domain` runs `check-domain.mjs` (`geo-domain-lib`). Both are
// looked up under the skill mount, not under a project path.
//
// A rerun is incremental: a stage whose output files are on disk is skipped while no
// earlier stage in the same run did work. `--stages` forces the listed stages, `--fresh`
// ignores the disk, and `--dry-run` prints the same plan without executing anything.

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isEntryPoint, parseFlags, wantsHelp } from "#lib/cli.mjs";
import { readJson } from "#lib/geo.mjs";

const usage = `Usage:
  node scripts/assemble.mjs --region leningrad-oblast --area 176095
  node scripts/assemble.mjs --region leningrad-oblast --admin-level 6,5 --bbox 59.6,29.4,60.3,30.4
  node scripts/assemble.mjs --region my-region --area 123456 --stages outline,boundaries --dry-run
  node scripts/assemble.mjs --region my-region --fresh

Flags:
  --region         geo folder name (required)
  --area           OSM relation id of the region; resolved by the scout stage when omitted
  --bbox           south,west,north,east for the OSM spring layer when the territory is not
                   inside the region relation
  --admin-level    comma separated OSM admin_level for boundaries, default 6. Pass 6,5 when
                   the region also holds city districts of a federal city
  --allow-drop     let the boundaries stage remove a district it cannot see in the response
  --districts      JSON mapping of { name, slug, type } for a new region
  --region-name    display name when index.geojson does not exist
  --admin-subject  subject name for feature properties
  --tolerance      simplification in degrees for the outline and the lakes
  --min-area       minimum lake area in km2, default 1
  --margin         sea bbox padding in degrees, default 0.25
  --endpoint       pin one Overpass mirror for every stage that queries it
  --stages         comma separated subset of
                   scout,outline,boundaries,osm-springs,water,seas,roads,index,validate,domain;
                   an explicit list forces those stages even when their files exist
  --fresh          ignore the disk and run every stage of the set
  --dry-run        print the plan with planned/skipped statuses, run nothing, exit 0
  --help           print this usage and exit

Stages:
  scout   resolves the area when --area is missing: the flag first, then area_id in
          geo/<region>/index.geojson, then find-osm-region.mjs. It is the only stage that
          may go online without being a data stage, and it writes no file.
  domain  runs check-domain.mjs from geo-domain-lib with --project <cwd>; it reports on
          stdout and writes nothing.

Incrementality:
  Without --stages and --fresh a stage is skipped while its output files are on disk and no
  earlier stage in this run performed work: a rebuilt input makes every later stage run, so
  index.geojson never drifts from a fresh boundaries.geojson.
  validate and domain always run: their value is the check, not a file on disk.
  "Built" for osm-springs means geo/<region>/osm-springs.geojson plus <district>/osm-springs.geojson
  for every district in boundaries.geojson; a missing district file runs the stage.
  needs_districts is a normal stop for a new region, not a failure: exit 0.`;

const HERE = path.dirname(fileURLToPath(import.meta.url));

// The skill mount, resolved the same way the project wrapper does it: PowerShell does not
// expand `~` in the middle of a path, so homedir() is the portable spelling.
const SKILLS_ROOT =
  process.env.OPENCODE_SKILLS_DIR ?? path.join(os.homedir(), ".config", "opencode", "skills");

const STAGE_LIST = {
  scout: {
    script: "find-osm-region.mjs",
    skill: "geo-source-search",
    writes: "nothing, resolves the area only",
    network: true,
  },
  outline: {
    script: "fetch-region-outline.mjs",
    writes: "geo/<region>/region.geojson",
    flags: ["region", "area", "tolerance", "endpoint"],
    network: true,
  },
  boundaries: {
    script: "fetch-boundaries.mjs",
    writes: "geo/<region>/boundaries.geojson",
    flags: ["region", "area", "admin-level", "districts", "region-name", "admin-subject", "endpoint", "allow-drop"],
    network: true,
  },
  "osm-springs": {
    script: "fetch-osm-springs.mjs",
    writes: "geo/<region>/osm-springs.geojson and <district>/osm-springs.geojson",
    flags: ["region", "area", "bbox", "region-name", "admin-subject", "endpoint"],
    network: true,
  },
  water: {
    script: "fetch-water.mjs",
    writes: "geo/<region>/water.geojson",
    flags: ["region", "area", "min-area", "tolerance", "endpoint"],
    network: true,
  },
  seas: {
    script: "fetch-seas.mjs",
    writes: "geo/<region>/sea.geojson",
    flags: ["region", "margin", "tolerance"],
    network: true,
  },
  roads: {
    script: "fetch-roads.mjs",
    writes: "geo/<region>/roads.geojson",
    flags: ["region", "area", "major", "minor", "tolerance", "endpoint"],
    network: true,
  },
  index: {
    script: "build-index.mjs",
    writes: "geo/<region>/index.geojson",
    flags: ["region"],
    network: false,
  },
  validate: {
    script: "validate-region.mjs",
    writes: "nothing, report on stdout only",
    flags: ["region"],
    network: false,
  },
  domain: {
    script: "check-domain.mjs",
    skill: "geo-domain-lib",
    writes: "nothing, report on stdout only",
    network: false,
  },
};

// `index` sits before `validate` because the validator compares the region OSM layer
// with the per-district counts stored in index.geojson: a refresh of the spring layer
// without a rebuild fails its own contract check.
const DEFAULT_ORDER = [
  "scout",
  "outline",
  "boundaries",
  "osm-springs",
  "water",
  "seas",
  "roads",
  "index",
  "validate",
  "domain",
];

const NEEDS_AREA = new Set(["outline", "boundaries", "water", "roads"]);

// No artifact to compare with the disk, so the check itself is the reason to run them.
const ALWAYS_RUN = new Set(["validate", "domain"]);

const NETWORK_PATTERN = /fetch failed|aborted|abort|ECONN|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket|timed out/i;
const NETWORK_HINT =
  "the stage could not reach the network. Check connectivity or the Overpass mirror; data for this stage was not written.";
const MISSING_SCRIPT_HINT =
  "set OPENCODE_SKILLS_DIR to the skills repository, or check that ~/.config/opencode/skills points at it.";

const argsFor = (flags, names) => {
  const args = [];
  for (const name of names) {
    if (flags[name] !== undefined && flags[name] !== null) args.push(`--${name}`, String(flags[name]));
  }
  return args;
};

const lastLine = (text) => {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const line = lines[lines.length - 1] ?? "";
  return line.length > 400 ? `${line.slice(0, 400)}...` : line;
};

const parseReport = (stdout) => {
  const text = stdout.trim();
  if (!text.startsWith("{")) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

const stageScriptPath = (stage) =>
  stage.skill
    ? path.join(SKILLS_ROOT, "data", stage.skill, "scripts", stage.script)
    : path.join(HERE, stage.script);

const runStage = (name, stage, args) =>
  new Promise((resolve) => {
    const scriptFile = stageScriptPath(stage);
    const base = { stage: name, script: stage.script, writes: stage.writes, status: "ran", args };
    if (!existsSync(scriptFile)) {
      resolve({
        ...base,
        code: 1,
        duration_ms: 0,
        ok: false,
        report: null,
        error: `stage script not found: ${scriptFile}`,
        hint: MISSING_SCRIPT_HINT,
      });
      return;
    }

    const started = process.hrtime.bigint();
    const child = spawn(process.execPath, [scriptFile, ...args], {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    const elapsed = () => Math.round(Number(process.hrtime.bigint() - started) / 1e6);
    let stdout = "";
    let stderr = "";
    let settled = false;

    const finish = (code, extra = {}) => {
      if (settled) return;
      settled = true;
      resolve({ ...base, code, duration_ms: elapsed(), ...extra });
    };

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
      process.stderr.write(chunk);
    });
    child.on("error", (error) => finish(1, { ok: false, report: null, error: error.message }));
    child.on("close", (code) => {
      const finalCode = code ?? 1;
      const report = parseReport(stdout);
      if (finalCode === 0) {
        finish(0, { ok: true, report });
        return;
      }
      const error = lastLine(stderr);
      const hint = stage.network && (NETWORK_PATTERN.test(error) || NETWORK_PATTERN.test(stderr)) ? NETWORK_HINT : null;
      finish(finalCode, { ok: false, report, error: error || `exited with code ${finalCode}`, hint });
    });
  });

const skippedStage = (name, stage) => ({
  stage: name,
  script: stage.script,
  writes: stage.writes,
  status: "skipped",
  args: [],
  code: null,
  duration_ms: 0,
  ok: true,
  report: null,
});

// `area_id` may be stored as the Overpass area id (3600000000 + osm_id) or as the relation
// id the `--area` flag takes; both normalize to the relation id.
const readIndexArea = (regionDir) => {
  const file = path.join(regionDir, "index.geojson");
  if (!existsSync(file)) return null;
  let index = null;
  try {
    index = readJson(file);
  } catch {
    return null;
  }
  const value = Number(index?.area_id);
  if (!Number.isFinite(value) || value <= 0) return null;
  return value >= 3600000000 ? value - 3600000000 : value;
};

const scoutName = (flags, regionDir) => {
  if (flags["region-name"]) return flags["region-name"];
  const file = path.join(regionDir, "index.geojson");
  if (existsSync(file)) {
    try {
      const index = readJson(file);
      const name = index?.name ?? index?.admin_subject;
      if (name) return name;
    } catch {
      // A broken index is a later stage's failure; scout falls back to the folder name.
    }
  }
  return flags.region;
};

const scoutArgs = (flags, regionDir) => {
  const args = ["--name", scoutName(flags, regionDir)];
  if (flags.endpoint) args.push("--endpoint", String(flags.endpoint));
  return args;
};

const stageArgs = (name, stage, flags, regionDir) => {
  if (name === "scout") return scoutArgs(flags, regionDir);
  if (name === "domain") return ["--project", process.cwd()];
  return argsFor(flags, stage.flags);
};

const districtSlugs = (regionDir) => {
  const file = path.join(regionDir, "boundaries.geojson");
  if (!existsSync(file)) return null;
  try {
    const boundaries = readJson(file);
    const slugs = (boundaries.features ?? []).map((feature) => feature.properties?.district_slug).filter(Boolean);
    return slugs.length > 0 ? slugs : null;
  } catch {
    return null;
  }
};

// The files a stage leaves behind. `null` means the stage has no artifact of its own.
const artifactFiles = (name, regionDir) => {
  const file = (value) => path.join(regionDir, value);
  switch (name) {
    case "outline":
      return [file("region.geojson")];
    case "boundaries":
      return [file("boundaries.geojson")];
    case "osm-springs": {
      const slugs = districtSlugs(regionDir);
      const regionLayer = file("osm-springs.geojson");
      // Without a district list there is nothing to compare with, so the missing
      // boundaries path keeps the stage runnable instead of silently "built".
      if (!slugs) return [regionLayer, file("boundaries.geojson")];
      return [regionLayer, ...slugs.map((slug) => file(path.join(slug, "osm-springs.geojson")))];
    }
    case "water":
      return [file("water.geojson")];
    case "seas":
      return [file("sea.geojson")];
    case "roads":
      return [file("roads.geojson")];
    case "index":
      return [file("index.geojson")];
    default:
      return null;
  }
};

const artifactState = (name, regionDir) => {
  const files = artifactFiles(name, regionDir);
  if (!files) return { complete: false, files: [], missing: [] };
  const missing = files.filter((entry) => !existsSync(entry));
  return { complete: missing.length === 0, files, missing };
};

// A new region has boundaries but no index yet, and build-index.mjs cannot invent district
// folders. Stop before it with the OSM names instead of failing on a missing springs file.
const districtsGap = (regionDir) => {
  if (existsSync(path.join(regionDir, "index.geojson"))) return null;
  const boundariesFile = path.join(regionDir, "boundaries.geojson");
  if (!existsSync(boundariesFile)) return null;
  let boundaries = null;
  try {
    boundaries = readJson(boundariesFile);
  } catch {
    return null;
  }

  const missing = [];
  for (const feature of boundaries.features ?? []) {
    const slug = feature.properties?.district_slug;
    if (!slug) continue;
    const districtDir = path.join(regionDir, slug);
    if (!existsSync(path.join(districtDir, "area.yaml")) || !existsSync(path.join(districtDir, "springs.geojson"))) {
      missing.push({ slug, district: feature.properties?.district ?? slug });
    }
  }
  if (missing.length === 0) return null;
  return {
    districts: missing.map((row) => row.district),
    slugs: missing.map((row) => row.slug),
  };
};

const display = (file) => path.relative(process.cwd(), file) || file;

const main = async () => {
  const argv = process.argv.slice(2);
  if (wantsHelp(argv)) {
    process.stdout.write(`${usage}\n`);
    return;
  }

  const flags = parseFlags(argv, {
    region: "string",
    area: "number",
    bbox: "string",
    "admin-level": "string",
    districts: "string",
    "region-name": "string",
    "admin-subject": "string",
    tolerance: "number",
    "min-area": "number",
    margin: "number",
    endpoint: "string",
    stages: "string",
    "allow-drop": "boolean",
    "dry-run": "boolean",
    fresh: "boolean",
  });

  if (!flags.region) throw new Error("--region is required");

  const regionDir = path.join(process.cwd(), "geo", flags.region);

  const order = flags.stages
    ? String(flags.stages)
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    : DEFAULT_ORDER;
  if (order.length === 0) throw new Error("--stages is empty");
  for (const name of order) {
    if (!STAGE_LIST[name]) {
      throw new Error(`unknown stage "${name}"; use ${Object.keys(STAGE_LIST).join(", ")}`);
    }
  }

  // `scout` may fill the area later; a value from the index is passed down the same way.
  const stageFlags = { ...flags };
  const indexArea = readIndexArea(regionDir);
  if (stageFlags.area === undefined && indexArea !== null) {
    stageFlags.area = indexArea;
    process.stderr.write(`note: area ${indexArea} taken from geo/${flags.region}/index.geojson\n`);
  }

  const forced = Boolean(flags.stages) || Boolean(flags.fresh);
  const areaStages = order.filter((name) => NEEDS_AREA.has(name));
  if (order.includes("boundaries") && flags["admin-level"] === undefined) {
    process.stderr.write("note: --admin-level is 6; pass 6,5 when the region holds city districts (level 5)\n");
  }

  if (flags["dry-run"]) {
    const plan = [];
    let dirty = false;
    for (const name of order) {
      const stage = STAGE_LIST[name];
      let status;
      if (name === "scout") {
        status = stageFlags.area === undefined ? "planned" : "skipped";
      } else if (ALWAYS_RUN.has(name) || forced) {
        status = "planned";
      } else {
        status = !dirty && artifactState(name, regionDir).complete ? "skipped" : "planned";
      }
      if (status === "planned") dirty = true;
      plan.push({
        stage: name,
        script: stage.script,
        writes: stage.writes,
        status,
        args: status === "skipped" ? [] : stageArgs(name, stage, stageFlags, regionDir),
        code: null,
        duration_ms: 0,
        ok: status === "skipped" ? true : null,
        report: null,
      });
    }

    process.stderr.write(
      `dry run: ${plan.filter((item) => item.status === "planned").length} of ${plan.length} stage(s) would run\n`,
    );
    process.stdout.write(
      `${JSON.stringify(
        {
          region: flags.region,
          area: stageFlags.area ?? null,
          bbox: flags.bbox ?? null,
          admin_level: flags["admin-level"] ?? "6",
          dry_run: true,
          ok: null,
          failed_stage: null,
          duration_ms: 0,
          stages: plan,
          error: null,
          hint: null,
          needs_districts: null,
        },
        null,
        2,
      )}\n`,
    );
    return;
  }

  const startedAll = process.hrtime.bigint();
  const results = [];
  let failed = null;
  let dirty = false;
  let needsDistricts = null;

  for (const name of order) {
    const stage = STAGE_LIST[name];

    if (name === "scout") {
      if (stageFlags.area !== undefined) {
        process.stderr.write(`· scout - skipped, area ${stageFlags.area} is known\n`);
        results.push(skippedStage(name, stage));
        continue;
      }
      const scout = await runStage(name, stage, stageArgs(name, stage, stageFlags, regionDir));
      if (!scout.ok) {
        results.push(scout);
        failed = scout;
        break;
      }
      const relation = Number(scout.report?.recommended_osm_id);
      if (!Number.isFinite(relation) || relation <= 0) {
        const error =
          scout.report?.notes?.[0] ??
          `no administrative relation found for "${scoutName(stageFlags, regionDir)}"`;
        const unresolved = {
          ...scout,
          ok: false,
          code: scout.code || 1,
          error,
          hint: "pass --area <OSM relation id> or --region-name with the place name",
        };
        results.push(unresolved);
        failed = unresolved;
        break;
      }
      stageFlags.area = relation;
      dirty = true;
      results.push(scout);
      process.stderr.write(`· scout - area ${relation}\n`);
      continue;
    }

    const state = artifactState(name, regionDir);
    const canSkip = !ALWAYS_RUN.has(name) && !forced && !dirty && state.complete;
    if (canSkip) {
      process.stderr.write(`· ${name} - skipped, ${display(state.files[0])} is on disk\n`);
      results.push(skippedStage(name, stage));
      continue;
    }

    if (NEEDS_AREA.has(name) && stageFlags.area === undefined) {
      throw new Error(`--area is required for the ${areaStages.join(", ")} stage(s)`);
    }

    if (name === "index") {
      const gap = districtsGap(regionDir);
      if (gap) {
        needsDistricts = gap;
        process.stderr.write(
          `· index - stops with needs_districts: ${gap.districts.length} district folder(s) are missing\n`,
        );
        break;
      }
    }

    process.stderr.write(`· ${name} (${stage.script})\n`);
    const result = await runStage(name, stage, stageArgs(name, stage, stageFlags, regionDir));
    results.push(result);
    if (!result.ok) {
      failed = result;
      break;
    }
    dirty = true;
  }

  const manifest = {
    region: flags.region,
    area: stageFlags.area ?? null,
    bbox: flags.bbox ?? null,
    admin_level: flags["admin-level"] ?? "6",
    dry_run: false,
    ok: failed === null,
    failed_stage: failed?.stage ?? null,
    duration_ms: Math.round(Number(process.hrtime.bigint() - startedAll) / 1e6),
    stages: results,
    error: failed?.error ?? null,
    hint: failed?.hint ?? null,
    needs_districts: needsDistricts,
  };

  process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
  if (failed) process.exitCode = failed.code;
};

if (isEntryPoint(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  });
}
