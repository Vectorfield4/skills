// Solution-only rubrics and findings: the G6 FAQ answer-relevance gate and the
// resolver for `relevants[]` (with a deterministic note-key check). The
// dictionary parsing lives in `jev-lines.mjs`; the shared filters live in
// `lib/prose`.

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { noulFinding } from "#lib/jev/findings.mjs";
import { noulQuestion } from "#lib/jev/questions.mjs";
import { entityText } from "#lib/prose/targets.mjs";

const ROOT = process.cwd();
const read = (file) => (existsSync(file) ? readFileSync(file, "utf8") : "");

export const SOLUTION_PROMPT_VERSION = "jev-solution@1";

/** G6: an FAQ answer must actually answer its question. A low `noul` is a finding. */
export function faqQuestions(count) {
  const questions = {};
  for (let i = 0; i < count; i += 1) {
    questions[`faq${i}`] = noulQuestion(
      `In \`faqs[${i}]\` (format "QUESTION — ANSWER"), the answer directly answers the question instead of restating it, dodging it, or changing the subject.`,
    );
  }
  return questions;
}

/** Solution fixture `relevants[]`, with resolved tagline text and note keys. */
export function solutionRelevants(slug, lang) {
  const src = read(path.join(ROOT, "src/entities/solution/model/fixtures", `${slug}.ts`));
  const index = src.indexOf("relevants: [");
  if (index < 0) return [];
  const out = [];
  const re = /type:\s*"(\w+)"\s*,\s*slug:\s*"([a-z0-9-]+)"\s*,\s*noteKey:\s*"([^"]*)"/g;
  for (const m of src.slice(index).matchAll(re)) {
    out.push({ type: m[1], slug: m[2], noteKey: m[3], text: entityText(m[1], m[2], lang) });
  }
  return out;
}

/** G6 + a deterministic note-key presence check. */
export function faqAndNoteFindings({ answers, faqs, targets, findings }) {
  faqs.forEach((faq, i) => {
    noulFinding(findings, answers[`faq${i}`], {
      line: faq.questionLine,
      rule: "FAQ_UNANSWERED_CANDIDATE",
      detail: faq.question.slice(0, 90),
    });
  });
  targets.forEach((target) => {
    if (!target.noteKey) {
      findings.push({
        line: 0,
        rule: "RELEVANT_NOTE_MISSING",
        confidence: 1,
        detail: `${target.type}:${target.slug}`,
      });
    }
  });
}
