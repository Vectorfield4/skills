# AEO filter (search and reader contract)

The `prose-critic` subagent applies this before returning PASS. An article leads
with the answer, not with a run-up, and the answer lands inside a lead hook.

## Lead hook

Every article opens with a lead hook: one paragraph, three to four sentences at
most, that earns the first screen before any definition.

- Sentence 1 sets the engineering or business conflict: the situation the reader
  is in and what it costs. This is the reader's problem, not the product's gap.
- Sentences 2-3 deliver the core answer: the un-evasive mechanism that resolves
  the conflict.
- An opening that drops the problem and leads with an abstract tool variable is
  an `AEO_VIOLATION`.

The hook carries the answer; it does not delay it. The target query is answered
inside the hook: the definition or the mechanism sits in the same paragraph.

## Rules

- One target query and one question. The caller passes them from the spec card
  (`spec-template.md`, section 3). If they are missing, ask for them instead of
  guessing.
- If the lead hook names an economic or time marker, the same paragraph carries
  the physical driver behind it: a shoot shift size, a model context window, a
  lemma count. An abstract price epithet with no driver is an `AEO_VIOLATION`.
- The lead hook states the problem first and answers the question in the same
  paragraph, without the body.
- The headline and the lead hook work alone: a manager who reads only them gets
  the problem and the point (`common.md`, Two readers).
- The target query appears in the title, the lead hook or the `excerpt` as a
  phrase a person would type. No keyword stuffing.
- The first 300 characters name the entity: a definition a parser can lift
  without the body. The window covers the title, the `excerpt` and the opening
  of the body; the deterministic half of this rule is
  `test/article-plan.test.ts` (the bridge article's `targetQuery` must land in
  the head). This filter owns the semantic half: the head defines the thing,
  it does not only gesture at it.

## Finding

One line per hit:

- `[file:line] AEO_VIOLATION: lead hook misses the problem.`
- `[file:line] AEO_VIOLATION: lead hook states no answer.`
- `[file:line] AEO_VIOLATION: lead hook names a cost with no driver.`
- `[file:line] AEO_VIOLATION: target query missing from the head.`
- `[file:line] AEO_VIOLATION: no entity definition in the first 300 characters.`
