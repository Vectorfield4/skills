#!/usr/bin/env node
// Advisory RU↔EN claim-parity check for an article (skill: write-article).
//
//   node .opencode/skills/content/write-article/scripts/parity.mjs <slug> [--json] [--advisory]
//
// Deterministic: the numeric claims in the RU and EN bodies are compared in
// code (`lib/prose/parity.mjs`). Advisory: one Jev verdict asks whether the two
// languages carry the same claims, allowing reordering and localization.
// Without an EN pair, or without RUNWARE_API_KEY, it skips and exits 0.

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { askDecisions, hasKey } from "#lib/jev/client.mjs";
import { noulFinding } from "#lib/jev/findings.mjs";
import { noulQuestion } from "#lib/jev/questions.mjs";
import { dedupe, formatFindings, makeReport } from "#lib/jev/report.mjs";
import { parityFindings } from "#lib/prose/parity.mjs";

const ROOT = process.cwd();

const args = process.argv.slice(2);
const [slug] = args.filter((arg) => !arg.startsWith("--"));
const advisory = args.includes("--advisory");
const json = args.includes("--json");

if (!slug) {
  console.error("usage: parity.mjs <slug> [--json] [--advisory]");
  process.exit(2);
}

const ruFile = path.join(ROOT, "articles", `${slug}.ru.md`);
const enFile = path.join(ROOT, "articles", `${slug}.en.md`);
if (!existsSync(ruFile) || !existsSync(enFile)) {
  console.log(`parity: пропущено — нет RU/EN пары для ${slug}.`);
  process.exit(0);
}

const body = (file) =>
  readFileSync(file, "utf8")
    .replace(/^---\r?\n[\s\S]*?\r?\n---/, "")
    .trim();
const ru = body(ruFile);
const en = body(enFile);

const findings = [];
parityFindings(ru, en, findings);

if (hasKey()) {
  const { answers, usage } = await askDecisions({
    state: { ru, en },
    questions: {
      same_claims: noulQuestion(
        "`en` carries the same facts and numbers as `ru`. Reordering, localization and different sentence structure are fine; a missing or changed claim is not.",
      ),
    },
  });
  noulFinding(findings, answers.same_claims, {
    line: 0,
    rule: "PARITY_FACT_MISMATCH",
    detail: "en vs ru",
  });
  const report = makeReport({
    kind: "parity",
    slug,
    lang: "ru+en",
    file: `articles/${slug}.{ru,en}.md`,
    units: 1,
    findings: dedupe(findings),
    usage,
    promptVersion: "jev-parity@1",
  });
  if (json) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(`\n${report.file}  [parity]`);
    console.log(formatFindings(report));
    console.log(`· tokens: ${usage.input_tokens} in / ${usage.output_tokens} out`);
  }
} else {
  const report = makeReport({
    kind: "parity",
    slug,
    lang: "ru+en",
    file: `articles/${slug}.{ru,en}.md`,
    units: 1,
    findings: dedupe(findings),
    promptVersion: "jev-parity@1",
  });
  if (json) console.log(JSON.stringify(report, null, 2));
  else {
    console.log("\nJev: пропущено (нет ключа) — только детерминированные числа.");
    console.log(formatFindings(report));
  }
}

process.exit(!advisory && findings.length ? 1 : 0);
