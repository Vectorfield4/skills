#!/usr/bin/env node
// Jev review CLI for source code (skill: code-quality).
//
// Usage:
//   node .opencode/skills/quality/code-quality/scripts/jev-review.mjs <path...> [--json] [--advisory] [--min-confidence 0.5]
//   node .opencode/skills/quality/code-quality/scripts/jev-review.mjs --stdin [--json] [--advisory]
//
// Reviews the top-level functions and classes of each file for SOLID and
// separation-of-concerns violations. Advisory: Jev labels candidates, it does
// not explain or rewrite. Exits 1 when candidates exist, unless --advisory.
// Without RUNWARE_API_KEY it prints a skip notice and exits 0.
//
// The engine lives in `lib/jev/`; this file is the code-quality wiring only.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { parseArgs, printReport, readStdin } from "#lib/jev/cli.mjs";
import { hasKey } from "#lib/jev/client.mjs";
import { collectChoices } from "#lib/jev/findings.mjs";
import { runReview } from "#lib/jev/review.mjs";
import { THRESHOLDS } from "#lib/jev/thresholds.mjs";
import { codeUnits } from "./jev-lines.mjs";
import { CODE_PROMPT_VERSION, principleQuestions } from "./jev-prompts.mjs";

const ROOT = process.cwd();
const EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const SKIP_DIRS = new Set(["node_modules", "dist", ".git", "build", "coverage"]);

/** Source files under a path: the file itself, or a recursive walk for a directory. */
function expand(target) {
  if (!existsSync(target)) return [];
  if (!statSync(target).isDirectory()) {
    return EXTENSIONS.has(path.extname(target)) ? [target] : [];
  }
  const out = [];
  for (const entry of readdirSync(target, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) out.push(...expand(path.join(target, entry.name)));
    } else if (EXTENSIONS.has(path.extname(entry.name))) {
      out.push(path.join(target, entry.name));
    }
  }
  return out;
}

/** Unit → findings over the generic choice collector. */
function codeFindings(units, answers, minConfidence) {
  const findings = [];
  collectChoices({
    units,
    answers,
    minConfidence,
    ruleFor: (principle) => `${principle.toUpperCase()}_CANDIDATE`,
    findings,
  });
  return findings;
}

/** The state + questions + mapping for a unit set, shared by file and stdin review. */
function reviewUnits(units, { slug, file, lang, minConfidence }) {
  return runReview({
    kind: "code",
    slug,
    file,
    lang,
    promptVersion: CODE_PROMPT_VERSION,
    state: {
      document: units.map((u) => u.text).join("\n\n"),
      units: units.map((u) => u.text),
      names: units.map((u) => u.name),
    },
    questions: principleQuestions(units.length),
    units: units.length,
    minConfidence,
    findingsFrom: (answers, min) => codeFindings(units, answers, min),
  });
}

/** One file; null when it has no top-level units to judge. */
function reviewFile(file, { lang, minConfidence }) {
  const units = codeUnits(readFileSync(file, "utf8"));
  if (!units.length) return null;
  const rel = path.relative(ROOT, file).replace(/\\/g, "/");
  return reviewUnits(units, { slug: rel, file: rel, lang, minConfidence });
}

/** A pasted fragment on stdin; null when it has no top-level units. */
function reviewInline(text, { lang, minConfidence }) {
  const units = codeUnits(text);
  if (!units.length) return null;
  return reviewUnits(units, { slug: "(stdin)", file: "(stdin)", lang, minConfidence });
}

const { flags, rest } = parseArgs(process.argv.slice(2));
const options = {
  lang: flags.lang,
  minConfidence: flags.minConfidence ?? THRESHOLDS.choiceConfidence,
};

if (!rest.length && !flags.stdin) {
  console.error("usage: jev-review.mjs <path...> [--json] [--advisory] [--min-confidence 0.5]");
  console.error("       jev-review.mjs --stdin [--json] [--advisory]  (code on stdin)");
  process.exit(2);
}
if (!hasKey()) {
  console.log("Jev: пропущено — RUNWARE_API_KEY не задан.");
  process.exit(0);
}

const reports = [];
if (flags.stdin) {
  const report = await reviewInline(await readStdin(), options);
  if (report) reports.push(report);
} else {
  const files = rest.flatMap(expand);
  if (!files.length) {
    console.error("Нет исходных файлов (.ts/.tsx/.js/.jsx/.mjs/.cjs) по указанным путям.");
    process.exit(2);
  }
  for (const file of files) {
    const report = await reviewFile(file, options);
    if (report) reports.push(report);
  }
}

for (const report of reports) printReport(report, flags.json);
const candidates = reports.reduce((sum, report) => sum + report.findings.length, 0);
process.exit(!flags.advisory && candidates ? 1 : 0);
