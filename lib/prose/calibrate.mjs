#!/usr/bin/env node
// Sensor calibration CLI (Phase 4).
//
// Runs `calibration-fixtures.json` through the semantic sensors and prints, per
// sensor, precision/recall at the current corridor plus a boundary sweep. A
// sensor with false positives stays `advisory` in `lib/prose/sensors.mjs`; tune
// it by moving `THRESHOLDS.sensor` in `lib/jev/thresholds.mjs`. A sensor whose
// precision is still ~0 at every boundary has a bad question, not a bad bar.
//
// Requires RUNWARE_API_KEY; exits 0 without it.
//
//   node lib/prose/calibrate.mjs [--json]

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { hasKey } from "../jev/client.mjs";
import { THRESHOLDS } from "../jev/thresholds.mjs";
import { sensorRun, sensorStats } from "./harnesses.mjs";

const FIXTURES = fileURLToPath(new URL("./calibration-fixtures.json", import.meta.url));
const json = process.argv.includes("--json");

if (!hasKey()) {
  console.log("Jev calibrate: пропущено — RUNWARE_API_KEY не задан.");
  process.exit(0);
}

const fixtures = JSON.parse(readFileSync(FIXTURES, "utf8"));
const rows = await sensorRun(fixtures);
const stats = sensorStats(rows);
const sweep = [0.1, 0.2, 0.3, 0.4, 0.5].map((act) => [act, sensorStats(rows, act)]);

if (json) {
  console.log(JSON.stringify({ act: THRESHOLDS.sensor.fail, rows, stats }, null, 2));
  process.exit(0);
}

console.log("\nrows (low noul = the sensor sees a violation):");
for (const row of rows) {
  const noul = row.noul == null ? "—" : row.noul.toFixed(2);
  console.log(
    `  ${row.sensor.padEnd(18)} noul=${noul.padStart(4)}  label=${row.label.padEnd(5)}  ${row.text.slice(0, 56)}`,
  );
}

console.log(`\nprecision/recall at the corridor (act=${THRESHOLDS.sensor.fail}):`);
for (const [sensor, s] of Object.entries(stats)) {
  const precision = s.precision == null ? "—" : s.precision.toFixed(2);
  const recall = s.recall == null ? "—" : s.recall.toFixed(2);
  console.log(
    `  ${sensor.padEnd(18)} TP=${s.tp} FP=${s.fp} FN=${s.fn} TN=${s.tn}  precision=${precision} recall=${recall}`,
  );
}

console.log("\nboundary sweep (precision by act):");
for (const [act, swept] of sweep) {
  const cells = Object.entries(swept)
    .map(([sensor, s]) => `${sensor}=${s.precision == null ? "—" : s.precision.toFixed(2)}`)
    .join("  ");
  console.log(`  act=${act.toFixed(2)}  ${cells}`);
}
