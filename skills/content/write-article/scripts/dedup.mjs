#!/usr/bin/env node
// Advisory near-duplicate check for an article (skill: write-article).
//
//   node .opencode/skills/content/write-article/scripts/dedup.mjs <slug> [--json] [--advisory]
//
// Builds a deterministic shortlist of the existing articles whose title and lead
// share the most tokens with the draft, then asks Jev whether the draft
// duplicates each. Advisory: it locates candidates for a human, it does not
// block. Without RUNWARE_API_KEY it prints a skip notice and exits 0.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { askDecisions, hasKey } from "#lib/jev/client.mjs";
import { noulQuestion } from "#lib/jev/questions.mjs";
import { dedupe, formatFindings, makeReport } from "#lib/jev/report.mjs";
import {
  articleParagraphs,
  frontmatterField,
  splitFrontmatter,
} from "#lib/prose/markdown.mjs";

const ROOT = process.cwd();
const ARTICLES = path.join(ROOT, "articles");
const TOP = 3;

const args = process.argv.slice(2);
const [slug] = args.filter((arg) => !arg.startsWith("--"));
const advisory = args.includes("--advisory");
const json = args.includes("--json");

if (!slug) {
  console.error("usage: dedup.mjs <slug> [--json] [--advisory]");
  process.exit(2);
}

const read = (file) => readFileSync(file, "utf8");
const tokens = (text) => new Set(text.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []);
const overlap = (a, b) => {
  let shared = 0;
  for (const token of a) if (b.has(token)) shared += 1;
  return shared / (a.size + b.size - shared || 1);
};

/** Title + first prose paragraph of one article file, or null when unreadable. */
function digest(file) {
  const source = read(file);
  const title = (frontmatterField(splitFrontmatter(source).frontmatter, "title") ?? "").replace(
    /^"|"$/g,
    "",
  );
  const lead = articleParagraphs(source)[0]?.text ?? "";
  return { title, lead };
}

const draftFile = path.join(ARTICLES, `${slug}.ru.md`);
if (!existsSync(draftFile)) {
  console.error(`нет articles/${slug}.ru.md`);
  process.exit(2);
}

const draft = digest(draftFile);
const draftTokens = tokens(`${draft.title} ${draft.lead}`);

const candidates = readdirSync(ARTICLES)
  .filter((file) => file.endsWith(".ru.md") && file !== `${slug}.ru.md`)
  .map((file) => {
    const d = digest(path.join(ARTICLES, file));
    return {
      slug: file.replace(/\.ru\.md$/, ""),
      ...d,
      score: overlap(draftTokens, tokens(`${d.title} ${d.lead}`)),
    };
  })
  .sort((a, b) => b.score - a.score)
  .slice(0, TOP)
  .filter((c) => c.score > 0);

if (!candidates.length) {
  console.log("dedup: кандидатов для сравнения нет.");
  process.exit(0);
}
if (!hasKey()) {
  console.log("Jev: пропущено — RUNWARE_API_KEY не задан.");
  process.exit(0);
}

const questions = {};
for (let i = 0; i < candidates.length; i += 1) {
  questions[`dup${i}`] = noulQuestion(
    `Does the draft article duplicate \`candidates[${i}]\` — the same topic and angle a reader would not need twice?`,
  );
}

const { answers, usage } = await askDecisions({
  state: {
    draft: { title: draft.title, lead: draft.lead },
    candidates: candidates.map((c) => ({ title: c.title, lead: c.lead })),
  },
  questions,
});

const findings = [];
candidates.forEach((candidate, i) => {
  const answer = answers[`dup${i}`];
  if (answer && answer.noul >= 0.8) {
    findings.push({
      line: 0,
      rule: "DEDUP_CANDIDATE",
      confidence: answer.noul,
      detail: candidate.slug,
    });
  }
});

const report = makeReport({
  kind: "dedup",
  slug,
  lang: "ru",
  file: `articles/${slug}.ru.md`,
  units: candidates.length,
  findings: dedupe(findings),
  usage,
  promptVersion: "jev-dedup@1",
});

if (json) {
  console.log(JSON.stringify({ ...report, candidates }, null, 2));
} else {
  console.log(`\n${report.file}  [dedup]  against ${candidates.map((c) => c.slug).join(", ")}`);
  console.log(formatFindings(report));
  console.log(`· tokens: ${usage.input_tokens} in / ${usage.output_tokens} out`);
}
process.exit(!advisory && findings.length ? 1 : 0);
