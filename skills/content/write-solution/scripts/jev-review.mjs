#!/usr/bin/env node
// Jev review CLI for solutions (skill: write-solution).
//
// Usage:
//   node .opencode/skills/content/write-solution/scripts/jev-review.mjs <slug> [--lang ru|en] [--json] [--advisory] [--gate]
//   node .opencode/skills/content/write-solution/scripts/jev-review.mjs --stdin [--json] [--advisory]
//
// One batched Jev call per solution: G1 (per-unit `noul` prose checklist),
// G2 (relevants, with a deterministic note-key check) and G6 (FAQ answers), with
// a circuit-breaker `verdict`. The rubrics live in `./jev-solution.mjs`, the
// runner in `lib/jev/chunked.mjs`; this file is wiring only.

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { runChunkedReview } from "#lib/jev/chunked.mjs";
import { runReviewCli } from "#lib/jev/cli.mjs";
import { JevError } from "#lib/jev/client.mjs";
import { wordCount } from "#lib/jev/text.mjs";
import { filterFindings, relevanceFindings } from "#lib/prose/findings.mjs";
import { reviewText } from "#lib/prose/inline.mjs";
import { filterQuestions, relevanceQuestions } from "#lib/prose/prompts.mjs";
import { solutionFaqs, solutionStrings } from "./jev-lines.mjs";
import {
  faqAndNoteFindings,
  faqQuestions,
  SOLUTION_PROMPT_VERSION,
  solutionRelevants,
} from "./jev-solution.mjs";

const ROOT = process.cwd();
const read = (file) => (existsSync(file) ? readFileSync(file, "utf8") : "");
const rel = (file) => path.relative(ROOT, file).replace(/\\/g, "/");

/** Units per request: 20 units × 5 filters per the token ceiling. */
const UNIT_CHUNK = 20;
/** Per-unit state cap: keeps a long dictionary from bloating the request. */
const UNIT_CAP = 1200;
const cap = (text) => (text.length > UNIT_CAP ? `${text.slice(0, UNIT_CAP)}…` : text);

/** Review a solution dictionary: G1 (filters), G2 (relevants), G6 (FAQ answers). */
export async function reviewSolution(slug, { lang = "ru" } = {}) {
  const file = path.join(ROOT, "src/entities/solution/i18n", lang, `${slug}.ts`);
  if (!existsSync(file)) throw new JevError("missing", `нет ${rel(file)}`);

  const source = read(file);
  const units = solutionStrings(source).filter((u) => wordCount(u.text) >= 3);
  const targets = solutionRelevants(slug, lang);
  const faqs = solutionFaqs(source);

  return runChunkedReview({
    kind: "solution",
    slug,
    lang,
    file: rel(file),
    promptVersion: SOLUTION_PROMPT_VERSION,
    units,
    chunkSize: UNIT_CHUNK,
    describe: (current, global) => ({
      state: {
        units: current.map((u) => cap(u.text)),
        ...(global
          ? {
              targets: targets.map((t) => t.text ?? ""),
              faqs: faqs.map((f) => `${f.question} — ${f.answer}`),
            }
          : {}),
      },
      questions: {
        ...filterQuestions(current.length),
        ...(global
          ? {
              ...relevanceQuestions(targets.length),
              ...faqQuestions(faqs.length),
            }
          : {}),
      },
      targets: global ? targets.length : 0,
      findingsFrom: (answers) => {
        const findings = [];
        filterFindings(current, answers, findings);
        if (global) {
          relevanceFindings(targets, answers, findings);
          faqAndNoteFindings({ answers, faqs, targets, findings });
        }
        return findings;
      },
    }),
  });
}

await runReviewCli({
  review: reviewSolution,
  inline: (text, options) => reviewText("solution", text, options),
  usage: [
    "usage: jev-review.mjs <slug> [--lang ru|en] [--json] [--advisory] [--gate]",
    "       jev-review.mjs --stdin [--lang ru|en] ...  (draft on stdin)",
  ],
});
