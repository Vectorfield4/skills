#!/usr/bin/env node
// Advisory readiness triage for draft articles (skill: write-article).
//
//   node .opencode/skills/content/write-article/scripts/triage.mjs [slug ...] [--json]
//
// Ranks drafts by a composite of Jev `score`s so a reviewer reads the
// closest-to-publish first. Weights live in `WEIGHTS`; each dimension is
// normalized by its top level. `confidence` is a routing factor only: an
// article with any low-confidence dimension is flagged `review`, never dropped
// or re-scored. Advisory — it sorts for a human, it never blocks. With no slugs
// it scans every draft article. Skips without RUNWARE_API_KEY.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { askDecisions, hasKey } from "#lib/jev/client.mjs";
import { scoreQuestion } from "#lib/jev/questions.mjs";

const ROOT = process.cwd();
const ARTICLES = path.join(ROOT, "articles");

/** Composite weights; they are the one place to tune the ranking. */
const WEIGHTS = { grounding: 0.4, argument: 0.3, readiness: 0.3 };
/** Any dimension below this confidence routes the article to review. */
const REVIEW_CONFIDENCE = 0.5;

const DIMENSIONS = {
  grounding: {
    question: "How grounded is `document` in concrete facts?",
    levels: [
      "Names no number, boundary or mechanism.",
      "Names a number or a boundary, but not both.",
      "Names numbers, boundaries and mechanisms a reader can check.",
    ],
  },
  argument: {
    question: "How well does `document` argue a single point through?",
    levels: [
      "Collects statements without a through-line.",
      "Has a point but loses it across sections.",
      "Holds one point from lead to conclusion.",
    ],
  },
  readiness: {
    question: "How close is `document` to publish-ready?",
    levels: [
      "Rough draft; structure or argument still missing.",
      "Needs a focused editing pass.",
      "Ready for a final read.",
    ],
  },
};

const args = process.argv.slice(2);
const json = args.includes("--json");
const slugs = args.filter((arg) => !arg.startsWith("--"));

const draftSlugs = () =>
  readdirSync(ARTICLES)
    .filter((file) => file.endsWith(".ru.md"))
    .map((file) => file.replace(/\.ru\.md$/, ""))
    .filter((slug) => {
      const src = readFileSync(path.join(ARTICLES, `${slug}.ru.md`), "utf8");
      return !/^draft:\s*false\s*,?\s*$/m.test(src);
    });

const targets = slugs.length ? slugs : draftSlugs();

if (!targets.length) {
  console.log("triage: нет draft-статей для оценки.");
  process.exit(0);
}
if (!hasKey()) {
  console.log("Jev: пропущено — RUNWARE_API_KEY не задан.");
  process.exit(0);
}

const rows = [];
for (const slug of targets) {
  const file = path.join(ARTICLES, `${slug}.ru.md`);
  if (!existsSync(file)) {
    console.error(`нет articles/${slug}.ru.md`);
    continue;
  }
  const document = readFileSync(file, "utf8")
    .replace(/^---\r?\n[\s\S]*?\r?\n---/, "")
    .trim();
  const questions = {};
  for (const [id, dim] of Object.entries(DIMENSIONS)) {
    questions[id] = scoreQuestion(dim.question, dim.levels);
  }
  const { answers } = await askDecisions({ state: { document }, questions });

  let composite = 0;
  let confidence = 1;
  for (const [id, dim] of Object.entries(DIMENSIONS)) {
    const answer = answers[id];
    const top = dim.levels.length - 1;
    composite += ((WEIGHTS[id] ?? 0) * (answer?.score ?? 0)) / top;
    confidence = Math.min(confidence, answer?.confidence ?? 0);
  }
  rows.push({
    slug,
    composite: Number(composite.toFixed(3)),
    confidence: Number(confidence.toFixed(2)),
    route: confidence < REVIEW_CONFIDENCE ? "review" : "ok",
  });
}

rows.sort((a, b) => b.composite - a.composite);

if (json) {
  console.log(JSON.stringify(rows, null, 2));
} else {
  console.log("\nreadiness triage (closest to publish first):");
  for (const row of rows) {
    console.log(
      `  ${row.route.padEnd(6)} ${row.composite.toFixed(3)}  conf=${row.confidence.toFixed(2)}  ${row.slug}`,
    );
  }
}
