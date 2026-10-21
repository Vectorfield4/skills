// The two Jev primitive shapes, as question factories. Domains compose these
// into their own question sets; the engine never knows what a criterion means.

/** One dominant-label `choice` question over a label→criterion map. */
export const choiceQuestion = (instructions, criteria) => ({
  type: "choice",
  instructions,
  criteria,
});

/**
 * One binary `noul` question stating the desirable property. `criteria`
 * optionally describes what a yes and a no mean (TypeSafe `{ true, false }`).
 */
export const noulQuestion = (instructions, criteria) =>
  criteria ? { type: "noul", instructions, criteria } : { type: "noul", instructions };

/** One `score` question along ordered `criteria` levels (low to high). */
export const scoreQuestion = (instructions, criteria) => ({
  type: "score",
  instructions,
  criteria,
});
