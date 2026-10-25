#!/usr/bin/env node
// Runs the geo assembly stages in order and prints ONE JSON manifest.
//
// Every stage is a sibling script and stays runnable on its own. This file only
// sequences them: it stops on the first non-zero exit, it writes no data itself and
// it keeps stdout for the manifest, so a caller parses one object while the stages'
// progress lines stay on stderr.

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isEntryPoint, parseFlags, wantsHelp } from "#lib/cli.mjs";

const usage = `Usage:
  node scripts/assemble.mjs --region leningrad-oblast --area 176095
  node scripts/assemble.mjs --region leningrad-oblast --area 176095 --admin-level 6,5 --bbox 59.6,29.4,60.3,30.4
  node scripts/assemble.mjs --region my-region --area 123456 --stages outline,boundaries --dry-run

Flags:
  --region         geo folder name (required)
  --area           OSM relation id of the region; required by outline, boundaries and water
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
  --stages         comma separated subset of outline,boundaries,osm-springs,water,seas,index,validate
  --dry-run        print the plan, run nothing, exit 0
  --help           print this usage and exit`;

const HERE = path.dirname(fileURLToPath(import.meta.url));

const STAGE_LIST = {
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
};

// `index` sits before `validate` because the validator compares the region OSM layer
// with the per-district counts stored in index.geojson: a refresh of the spring layer
// without a rebuild fails its own contract check.
const DEFAULT_ORDER = ["outline", "boundaries", "osm-springs", "water", "seas", "index", "validate"];

const NEEDS_AREA = new Set(["outline", "boundaries", "water"]);

const NETWORK_PATTERN = /fetch failed|aborted|abort|ECONN|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket|timed out/i;
const NETWORK_HINT =
  "the stage could not reach the network. Check connectivity or the Overpass mirror; data for this stage was not written.";

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

const runStage = (name, stage, flags) =>
  new Promise((resolve) => {
    const started = process.hrtime.bigint();
    const script = path.join(HERE, stage.script);
    const args = argsFor(flags, stage.flags);
    const child = spawn(process.execPath, [script, ...args], {
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
      resolve({ stage: name, script: stage.script, writes: stage.writes, args, code, duration_ms: elapsed(), ...extra });
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
    child.on("error", (error) => finish(1, { ok: false, error: error.message }));
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
  });

  if (!flags.region) throw new Error("--region is required");

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
  const needsArea = order.filter((name) => NEEDS_AREA.has(name));
  if (needsArea.length > 0 && !flags.area) {
    throw new Error(`--area is required for the ${needsArea.join(", ")} stage(s)`);
  }
  if (order.includes("boundaries") && flags["admin-level"] === undefined) {
    process.stderr.write("note: --admin-level is 6; pass 6,5 when the region holds city districts (level 5)\n");
  }

  const startedAll = process.hrtime.bigint();
  const results = [];

  if (flags["dry-run"]) {
    for (const name of order) {
      const stage = STAGE_LIST[name];
      results.push({
        stage: name,
        script: stage.script,
        writes: stage.writes,
        args: argsFor(flags, stage.flags),
        code: null,
        duration_ms: null,
        ok: null,
      });
    }
    process.stdout.write(
      `${JSON.stringify(
        {
          region: flags.region,
          area: flags.area ?? null,
          bbox: flags.bbox ?? null,
          dry_run: true,
          ok: null,
          failed_stage: null,
          duration_ms: 0,
          stages: results,
        },
        null,
        2,
      )}\n`,
    );
    return;
  }

  let failed = null;
  for (const name of order) {
    const stage = STAGE_LIST[name];
    process.stderr.write(`· ${name} (${stage.script})\n`);
    const result = await runStage(name, stage, flags);
    results.push(result);
    if (!result.ok) {
      failed = result;
      break;
    }
  }

  const manifest = {
    region: flags.region,
    area: flags.area ?? null,
    bbox: flags.bbox ?? null,
    admin_level: flags["admin-level"] ?? "6",
    dry_run: false,
    ok: failed === null,
    failed_stage: failed?.stage ?? null,
    duration_ms: Math.round(Number(process.hrtime.bigint() - startedAll) / 1e6),
    stages: results,
    ...(failed ? { error: failed.error, hint: failed.hint ?? null } : {}),
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
