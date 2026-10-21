// Service-only rubrics and findings: the G5 block-semantics gate and the
// resolver for `relevants[]`. The dictionary parsing lives in `jev-lines.mjs`;
// the shared filters/sensors live in `lib/prose`.

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { noulFinding } from "#lib/jev/findings.mjs";
import { noulQuestion } from "#lib/jev/questions.mjs";
import { wordCount } from "#lib/jev/text.mjs";
import { entityText } from "#lib/prose/targets.mjs";

const ROOT = process.cwd();
const read = (file) => (existsSync(file) ? readFileSync(file, "utf8") : "");

export const SERVICE_PROMPT_VERSION = "jev-service@1";

/** G5a: a `mechanism` item must read as a point plus its consequence, not a fragment. */
export function mechanismQuestions(count) {
  const questions = {};
  for (let i = 0; i < count; i += 1) {
    questions[`mech${i}`] = noulQuestion(
      `\`mechanisms[${i}]\` reads as a point plus its consequence — a full paragraph, not a fragment.`,
    );
  }
  return questions;
}

/** G5b: a block title must name something its own text actually talks about. */
export function titleQuestions(count) {
  const questions = {};
  for (let i = 0; i < count; i += 1) {
    questions[`title${i}`] = noulQuestion(
      `In \`titleChecks[${i}]\` (format "TITLE — TEXT"), the title names something the text actually talks about.`,
    );
  }
  return questions;
}

/** G5c: a `sections` item must read as a full sentence, not a fragment. */
export function sectionItemQuestions(count) {
  const questions = {};
  for (let i = 0; i < count; i += 1) {
    questions[`sec${i}`] = noulQuestion(
      `\`sectionItems[${i}]\` reads as a full sentence, not a fragment.`,
    );
  }
  return questions;
}

/** Service fixture `relevants[]`, with resolved tagline text. */
export function serviceRelevants(slug, lang) {
  const src = read(path.join(ROOT, "src/entities/service/model/fixtures", `${slug}.ts`));
  const index = src.indexOf("relevants: [");
  if (index < 0) return [];
  const out = [];
  for (const m of src.slice(index).matchAll(/type:\s*"(\w+)"\s*,\s*slug:\s*"([a-z0-9-]+)"/g)) {
    out.push({ type: m[1], slug: m[2], text: entityText(m[1], m[2], lang) });
  }
  return out;
}

/** G5: `mechanism` fragments, off-title blocks and fragment `sections` items. */
export function blockFindings({ answers, blocks, pairs, sectionItems, findings }) {
  blocks.mechanism.forEach((item, i) => {
    if (!item.text || wordCount(item.text) < 20) return;
    noulFinding(findings, answers[`mech${i}`], {
      line: item.textLine,
      rule: "MECHANISM_FRAGMENT_CANDIDATE",
      detail: item.text.slice(0, 90),
    });
  });
  pairs.forEach((item, i) => {
    noulFinding(findings, answers[`title${i}`], {
      line: item.titleLine,
      rule: "BLOCK_TITLE_CANDIDATE",
      detail: item.title,
    });
  });
  sectionItems.forEach((item, i) => {
    if (wordCount(item.value) < 3) return;
    noulFinding(findings, answers[`sec${i}`], {
      line: item.line,
      rule: "SECTION_FRAGMENT_CANDIDATE",
      detail: item.value.slice(0, 90),
    });
  });
}
