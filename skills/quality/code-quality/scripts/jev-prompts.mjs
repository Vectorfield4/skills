// Code-quality Jev rubrics: SOLID and separation of concerns. The engine (Jev
// transport, thresholds, question factories) lives in `lib/jev/`; this file is
// the only home for the design rubrics.

import { choiceQuestion } from "#lib/jev/questions.mjs";

export const CODE_PROMPT_VERSION = "jev-code-quality@1";

/** SOLID + SoC rubrics (G1). One dominant-principle `choice` per unit. */
export const PRINCIPLES = {
  srp: "has more than one reason to change — mixes concerns such as business rules, I/O, formatting and orchestration in one unit",
  ocp: "must be edited to support a new case or variant (a long if/switch on a type, a growing branch list) instead of being extended",
  lsp: "an implementation breaks the contract of the type it substitutes — throws where the base promises a value, narrows inputs or widens outputs",
  isp: "a consumer depends on a fat interface and is forced to use or stub members it does not need",
  dip: "depends on a concrete implementation, global or infrastructure detail (new ConcreteClient(), inline fetch, process.env in domain logic) instead of an abstraction",
  soc: "mixes layers or responsibilities in one unit — I/O with parsing, transport with rendering, validation with persistence, UI with data access",
};

const CRITERIA = { ...PRINCIPLES, none: "The unit breaks none of the principles." };

/** One dominant-principle `choice` per unit. `units[i]` carries the code text. */
export function principleQuestions(unitCount) {
  const questions = {};
  for (let i = 0; i < unitCount; i += 1) {
    questions[`u${i}`] = choiceQuestion(
      `Which single design principle, if any, does \`units[${i}]\` most clearly violate? Judge structure, not style. Choose the strongest.`,
      CRITERIA,
    );
  }
  return questions;
}
