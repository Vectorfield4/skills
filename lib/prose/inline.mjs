// Inline review of a draft fragment pasted on stdin, before it reaches disk.
//
// Runs the per-unit prose-filter checklist (G1) — one `noul` per unit and
// filter in a single request. Genre, structure, AEO and the relevance gate need
// the file's frontmatter and linked targets, so they stay in the file-level
// article/service review. Units are prose paragraphs, so markdown and plain
// copy both work.

import { makeReport } from "../jev/report.mjs";
import { runReview } from "../jev/review.mjs";
import { filterFindings } from "./findings.mjs";
import { articleParagraphs } from "./markdown.mjs";
import { filterQuestions, PROSE_PROMPT_VERSION } from "./prompts.mjs";

/** Review a pasted fragment: one `noul` per paragraph and filter. */
export async function reviewText(kind, text, { lang = "ru" } = {}) {
  const units = articleParagraphs(text);
  if (!units.length) {
    return makeReport({
      kind,
      slug: "(stdin)",
      lang,
      file: "(stdin)",
      units: 0,
      findings: [],
      promptVersion: PROSE_PROMPT_VERSION,
    });
  }
  return runReview({
    kind,
    slug: "(stdin)",
    lang,
    file: "(stdin)",
    promptVersion: PROSE_PROMPT_VERSION,
    state: {
      document: units.map((u) => u.text).join("\n\n"),
      units: units.map((u) => u.text),
    },
    questions: filterQuestions(units.length),
    units: units.length,
    findingsFrom: (answers) => {
      const findings = [];
      filterFindings(units, answers, findings);
      return findings;
    },
  });
}
