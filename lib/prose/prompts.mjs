// The shared content rubrics for the write-article and write-service skills.
// This is a domain, not the Jev engine: the prose filters, the relevance gate
// and the strict probes. The numbers live in `lib/jev/thresholds.mjs`.
//
// G1 is a per-unit `noul` checklist: one question per (unit, filter). The
// violation statement is `what`; `examples` are violating texts a reader would
// recognize; `not_for` separates the boundary from a clean unit. The rule
// names (`<FILTER>_CANDIDATE`) and `FILTER_IDS` are a stable contract.

import { noulQuestion } from "../jev/questions.mjs";

export const PROSE_PROMPT_VERSION = "jev-prose@2";

/** Per-unit prose rules (G1). `what` is the violation the model judges. */
export const FILTERS = {
  negative_connotation: {
    what: "argues from negation or fear (not X but Y, not just X, doomsaying, legacy-bashing) instead of stating what the system does",
    examples: ["Это не чат-бот, а агент.", "Не просто отвечает, а действует."],
    not_for: "a plain positive statement of what the system does",
  },
  fake_depth: {
    what: "sounds substantial but names no number, boundary or mechanism; gloss idioms like «корпоративного уровня», «бесшовная интеграция», unqualified superlatives",
    examples: ["Это интеграция корпоративного уровня.", "Бесшовное подключение без границ."],
    not_for: "a claim that names a number, a boundary or a mechanism",
  },
  structural_slop: {
    what: "a sentence-level AI tell: tri-colon, forced rule of three, false range, hedging stack, generic conclusion, abstract metaphor noun (substrate, wedge, nexus, paradigm)",
    examples: ["Не быстро, не дёшево, а масштабно.", "Платформа, экосистема и синергия."],
    not_for: "a plain sentence with one clear point",
  },
  synthetic_depth: {
    what: "an empty transition («важно отметить», «кроме того», furthermore), a spatial bridge («ниже», «в следующем разделе», below) or an unqualified puffery adjective («мощный», «гибкий», «надёжный» / flexible, powerful, reliable)",
    examples: ["Важно отметить, что решение мощное.", "Ниже приведена матрица решений."],
    not_for: "text that makes its point without a filler transition or a bare adjective",
  },
  tautology: {
    what: "says the same thing twice, adds no fact",
    examples: ["Конвейер стоит столько, сколько стоят его этапы."],
    not_for: "a restatement that adds a new number, actor or consequence",
  },
};

export const FILTER_IDS = Object.keys(FILTERS);

const VIOLATES = "The unit breaks none of the rules.";

/**
 * G1: one `noul` per (unit, filter). `answer.noul` is the probability that the
 * unit violates the filter named in the key `u<i>_<filterId>`.
 */
export function filterQuestions(unitCount) {
  const questions = {};
  for (let i = 0; i < unitCount; i += 1) {
    for (const id of FILTER_IDS) {
      const rule = FILTERS[id];
      questions[`u${i}_${id}`] = noulQuestion(
        `Does \`units[${i}]\` violate this rule: ${rule.what}?`,
        {
          true: { what: "the unit violates the rule", examples: rule.examples },
          false: { what: VIOLATES, not_for: rule.not_for },
        },
      );
    }
  }
  return questions;
}

/** G2: one `noul` per linked target. `targets[i]` carries its tagline/description. */
export function relevanceQuestions(targetCount) {
  const questions = {};
  for (let i = 0; i < targetCount; i += 1) {
    questions[`rel${i}`] = noulQuestion(
      `Is \`targets[${i}]\` a genuine, plausible next step for a reader of \`document\`? Judge topical and commercial fit, not shared words.`,
    );
  }
  return questions;
}
