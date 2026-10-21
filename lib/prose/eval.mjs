#!/usr/bin/env node
// Calibration CLI for the Jev prose-filter gate (G1).
//
// Default: the dual harness — the production `noul` checklist against the legacy
// `choice` — over `eval-fixtures.json`, printing both accuracies, their
// agreement and a per-filter confusion matrix.
//
//   --repeat N: the stability harness — the `noul` checklist N times, modal
//   label and agreement per item. A measurement, not a loop.
//
// Requires RUNWARE_API_KEY; exits 0 without it.
//
//   node lib/prose/eval.mjs [--json] [--repeat N]

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { hasKey } from "../jev/client.mjs";
import { dualRun, stabilityRun } from "./harnesses.mjs";
import { PROSE_PROMPT_VERSION } from "./prompts.mjs";

const FIXTURES = fileURLToPath(new URL("./eval-fixtures.json", import.meta.url));
const argv = process.argv.slice(2);
const json = argv.includes("--json");
const repeatIndex = argv.indexOf("--repeat");
const repeat = repeatIndex >= 0 ? Math.max(1, Number(argv[repeatIndex + 1]) || 1) : 1;

if (!hasKey()) {
  console.log("Jev eval: пропущено — RUNWARE_API_KEY не задан.");
  process.exit(0);
}

const fixtures = JSON.parse(readFileSync(FIXTURES, "utf8"));

if (repeat > 1) {
  const rows = await stabilityRun(fixtures, repeat);
  const lowAgreement = rows.filter((r) => r.agreement < 1);
  if (json) {
    console.log(JSON.stringify({ promptVersion: PROSE_PROMPT_VERSION, repeat, rows }, null, 2));
  } else {
    console.log(`\nstability over ${repeat} runs:`);
    for (const row of rows) {
      const flag = row.agreement < 1 ? "LOW " : "STAB";
      console.log(
        `${flag} ${row.id.padEnd(22)} modal=${row.modal.padEnd(21)} agree=${row.agreement.toFixed(2)}  expect=${row.expect}`,
      );
    }
    console.log(
      `\nstable: ${rows.length - lowAgreement.length}/${rows.length}; low-agreement: ${lowAgreement.length}`,
    );
  }
  process.exit(0);
}

const { labels, stats, rows } = await dualRun(fixtures);
const noulCorrect = rows.filter((r) => r.noulGot === r.expect).length;
const legacyCorrect = rows.filter((r) => r.legacyGot === r.expect).length;
const agree = rows.filter((r) => r.noulGot === r.legacyGot).length;

if (json) {
  console.log(
    JSON.stringify(
      { promptVersion: PROSE_PROMPT_VERSION, noulCorrect, legacyCorrect, agree, rows, stats },
      null,
      2,
    ),
  );
} else {
  console.log("");
  for (const row of rows) {
    const ok = row.noulGot === row.expect ? "OK  " : "MISS";
    console.log(
      `${ok} ${row.id.padEnd(22)} expect=${row.expect.padEnd(21)} noul=${row.noulGot.padEnd(21)} p=${row.confidence.toFixed(2)}  legacy=${row.legacyGot}`,
    );
  }
  console.log(`\nNoul accuracy:   ${noulCorrect}/${rows.length}`);
  console.log(`Legacy accuracy: ${legacyCorrect}/${rows.length}`);
  console.log(`Harness agreement: ${agree}/${rows.length}\n`);
  for (const label of labels) {
    const s = stats[label];
    const total = s.tp + s.fp + s.fn + s.tn || 1;
    console.log(
      `  ${label.padEnd(21)} TP=${s.tp} FP=${s.fp} FN=${s.fn} TN=${s.tn}  acc=${((s.tp + s.tn) / total).toFixed(2)}`,
    );
  }
}
