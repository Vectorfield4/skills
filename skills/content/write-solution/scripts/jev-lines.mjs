// Solution dictionary parsing for the Jev review gates (skill: write-solution).
//
// A solution copy is a TS dictionary of string literals, like a service. The
// shared `tsStrings` locates every prose literal; `solutionFaqs` reads the FAQ
// `{question, answer}` pairs for the answer-relevance gate. Neither judges
// anything — it only locates text.

import { tsStrings } from "#lib/prose/ts.mjs";
import { tsPairs } from "#lib/prose/ts-blocks.mjs";

export { tsStrings as solutionStrings };

/** FAQ `{question, answer}` pairs with both source lines. */
export function solutionFaqs(tsSource) {
  return tsPairs(tsSource, "faqItems", "question", "answer").map((pair) => ({
    question: pair.a,
    questionLine: pair.aLine,
    answer: pair.b,
    answerLine: pair.bLine,
  }));
}
