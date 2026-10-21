# Structural slop filter (anti-pattern gate)

The `prose-critic` subagent applies this before returning PASS. It catches the
sentence- and paragraph-level AI tells the other filters miss. The canonical
list is `docs/frontend/prose-quality.md`, "Banned structural patterns" #1-36.
The Scan list below is its operative form and is self-contained for the critic;
the doc itself is provenance and the writer's deep reference. Judge against the
Scan list, not against the whole document.

## Scan

- Rhythm: five consecutive sentences of near-equal length. Break one.
- Paragraph rhythm: five or more consecutive body paragraphs of comparable
  length (within ~15 words of each other). Break the run with a short or a long
  paragraph.
- Tri-colon: "not A, not B, but C". State C.
- Rule of three: forcing items into threes. Use the natural number.
- False range: "from X to Y" where X and Y are not on a scale. List directly.
- Colon: banned only as a mid-sentence connector that stands in for "that is"
  or "which means" («X: и это значит Y»). Fine before a list or an example,
  including an imperative step («Проверьте: прогоните один промпт»). Replace
  the connector, not the list colon.
- Inline-header list: "**Performance:** Performance improved...". Convert to
  prose. A bold lead-in that ends in a period, names the item, and is followed
  by genuinely new detail is fine: "**Schema in TypeScript.** Tables live in one
  file." The test is whether the label restates the sentence after it.
- Title-case headings. Use sentence case.
- Non-building lists: items that repeat instead of adding. Order by importance.
- Name-dropping: an outlet named with no context. Pick one, say what it said.
- Promotional language: nestled, vibrant, groundbreaking, renowned, stunning.
- Hedging: "could potentially possibly be argued". Say may.
- Dense sentence: the reader backtracks to parse it. Split or drop clauses.
- Generic conclusion: "the future looks bright". State a plan or a fact.
- Chatbot and sycophantic phrases: "I hope this helps", "Great question".
- Abstract metaphor nouns: substrate, wedge, vector, nexus, paradigm, flywheel.
  Use the concrete word.
- Paragraph-ending restatement: cut a last sentence that repeats the
  paragraph's opening claim in near-identical words. A closing sentence that
  carries a number, a limit, a concrete step or a consequence is not a
  restatement and stays.

## Deterministic overlap

`test/copy-guards.test.ts` fails the EN `-ing` phrases and the banned
constructions for dictionary copy; `test/articles.test.ts` sweeps articles for
the lexicon. This filter judges the structural forms a regex cannot.

## Finding

One line per hit: `[file:line] STRUCTURAL_SLOP_VIOLATION: <pattern>.`
