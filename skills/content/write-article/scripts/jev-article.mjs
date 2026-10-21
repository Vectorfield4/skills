// Article-only rubrics and document-level findings: genre, structure and the
// AEO lead hook, the frontmatter metadata gate, and the linked-target resolver.
// The shared filters/sensors live in `lib/prose`; this is the article domain.

import { noulFinding } from "#lib/jev/findings.mjs";
import { choiceQuestion, noulQuestion } from "#lib/jev/questions.mjs";
import { THRESHOLDS } from "#lib/jev/thresholds.mjs";
import { relevanceFindings } from "#lib/prose/findings.mjs";
import { frontmatterList } from "#lib/prose/markdown.mjs";
import { entityText } from "#lib/prose/targets.mjs";

export const ARTICLE_PROMPT_VERSION = "jev-article@1";

/** Article genres and the structures each may use (from write-article/SKILL.md). */
export const GENRE_STRUCTURES = {
  product: ["PSI", "How-To"],
  research: ["PSI", "Breakdown", "Journey"],
  technical: ["Breakdown", "How-To"],
  "case-study": ["PSI", "Journey"],
  corporate: ["PSI", "Journey"],
  industry: ["Comparison", "Breakdown"],
  media: ["Breakdown"],
  community: ["PSI"],
};

export const STRUCTURES = {
  PSI: "problem, then solution, then effect",
  Breakdown: "context, then mechanism, then limits",
  Comparison: "criterion, option A, option B, then a verdict",
  "How-To": "problem, prerequisites, steps, then verification",
  Journey: "status quo, challenge, failed attempts, insight, result",
};

/** G3a: article genre versus the declared frontmatter category. */
export function genreQuestion() {
  return choiceQuestion("Which single news-section genre does `document` belong to?", {
    product: "A solution or product choice for the reader",
    research: "Broad research coverage",
    technical: "A deep technical breakdown or how-to",
    "case-study": "One specific client case",
    corporate: "Corporate news",
    industry: "Industry coverage or a comparison",
    media: "A roundup of media",
    community: "Community news",
  });
}

/** G3b: article structure versus the one the genre allows. */
export function structureQuestion() {
  return choiceQuestion("Which single structure does `document` follow?", STRUCTURES);
}

/** G4: AEO lead-hook. Both nouls state the desirable property; a low value is a finding. */
export function leadQuestions() {
  return {
    aeo_problem: noulQuestion(
      "`lead` states the reader's problem or situation first, not an about-the-product run-up.",
    ),
    aeo_answer: noulQuestion(
      "`lead` carries the core answer or mechanism of the article in the same paragraph.",
    ),
  };
}

/** G7: the frontmatter metadata carries its weight. A low `noul` is a finding. */
export function metaQuestions() {
  return {
    meta_title: noulQuestion(
      "`title` names a specific outcome and audience, not a generic phrase.",
    ),
    meta_description: noulQuestion(
      "`description` states the reader's problem and the core answer in one or two sentences.",
    ),
    meta_excerpt: noulQuestion(
      "`excerpt` adds information beyond the title and does not restate `description`.",
    ),
  };
}

const META_RULES = {
  meta_title: "TITLE_WEAK_CANDIDATE",
  meta_description: "DESCRIPTION_WEAK_CANDIDATE",
  meta_excerpt: "EXCERPT_WEAK_CANDIDATE",
};

/** Article frontmatter links, with resolved tagline text for the relevance gate. */
export function articleTargets(frontmatter, lang) {
  const fields = [
    ["service", "relatedServices"],
    ["solution", "relatedSolutions"],
    ["case", "relatedCases"],
  ];
  const out = [];
  for (const [type, key] of fields) {
    for (const slug of frontmatterList(frontmatter, key)) {
      out.push({ type, slug, text: entityText(type, slug, lang) });
    }
  }
  return out;
}

/** G3 (genre/structure) + G4 (AEO) + G2 (targets) + G7 (metadata). */
export function articleGlobalFindings({ units, category, meta, answers, targets = [], findings }) {
  const genre = answers.genre;
  if (
    genre &&
    category &&
    genre.choice !== category &&
    genre.confidence >= THRESHOLDS.choiceConfidence
  ) {
    findings.push({
      line: 1,
      rule: "GENRE_MISMATCH",
      confidence: genre.confidence,
      detail: `declared ${category}, reads as ${genre.choice}`,
      severity: "fail",
    });
  }
  const structure = answers.structure;
  const allowed = GENRE_STRUCTURES[category];
  if (
    structure &&
    allowed &&
    !allowed.includes(structure.choice) &&
    structure.confidence >= THRESHOLDS.choiceConfidence
  ) {
    findings.push({
      line: 1,
      rule: "STRUCTURE_MISMATCH",
      confidence: structure.confidence,
      detail: `reads as ${structure.choice}; ${category} allows ${allowed.join("/")}`,
      severity: "fail",
    });
  }

  // G4 is the one signal that matched the critic on a real draft, so it is
  // review-level: a weak lead hook routes the article to the critic, not a fail.
  const leadLine = units[0]?.line ?? 1;
  for (const key of ["aeo_problem", "aeo_answer"]) {
    noulFinding(findings, answers[key], {
      line: leadLine,
      rule: `${key.toUpperCase()}_CANDIDATE`,
      detail: "lead hook",
      severity: "review",
    });
  }
  relevanceFindings(targets, answers, findings);

  for (const [key, rule] of Object.entries(META_RULES)) {
    noulFinding(findings, answers[key], { line: 1, rule, detail: meta[key] ?? "" });
  }
}
