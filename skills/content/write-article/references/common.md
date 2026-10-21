# Common rules

Apply to every genre. The genre reference adds specifics, it never relaxes
these. This file is the skeleton and composition: reader layout, pacing,
structure, typography, linking, volume. Tone, lexicon and argument rules live in
`references/filters/` (see Rule homes). Read both before drafting; the
`prose-critic` subagent judges by the same files.

## Two readers

- Skim (manager): headline, first sentence, conclusion.
- Deep (engineer): body, numbers, limits, reproducibility.

The conclusion restates the point in fresh words. It never repeats the intro.

## Point first

Lead every paragraph with its point: the conclusion, the number, or the
decision the reader needs. The next two or three sentences carry the detail.
The last sentence adds something; it never restates the opening. Bold follows
`prose-quality.md` #21: one key term, not every noun.

## Visual anchors

No wall of text. One to one and a half screens carry an anchor: a short list, a
table, a code block, or a small diagram. No decorative emoji and no callout box
for its own sake (`prose-quality.md` #24).

## One structure

Choose exactly one and do not mix. The skeletons live in
`references/structures/`:

- PSI — problem → solution → effect.
- Breakdown — context → mechanism → limits.
- Comparison — criterion → option A → option B → verdict.
- How-To — problem → prerequisites → steps → verification.
- Journey — status quo → challenge → failed attempts → insight → result.
- Changelog — window → dated entries → action (`HoFu` releases).

A genre lists which of these it may use in `genres/<genre>.md`.

## Funnel and one action

- Охват: link to a neighboring solution or breakdown.
- Выбор: inline CTA to a service or solution.
- Решение: request form or a case link.
- Удержание (`HoFu`): a "what changed" note plus a link for an existing account.

One stage, one action. How the action is worded is a tone rule:
`filters/FakeDepthTextFilter.md`.

## Typography

- EN carries no em dash and no curly quotes. RU uses «ёлочки».
- `test/copy-guards.test.ts` and `test/articles.test.ts` enforce this.

## Linking

At least one commercial entity via `relatedServices`, `relatedSolutions`,
`relatedCases`. Add internal links to adjacent breakdowns. A draft target is
fine: `dropDraftLinks` unwraps the link and it returns on publication.

## Search and AEO

The rule lives in `filters/AeoTextFilter.md`: one target query, one question,
a problem-first lead hook that carries the answer, and the entity definition
inside the first 300 characters.

## RU / EN parity

RU is written first. An EN mirror is optional: write it when the calendar row is
marked `RU+EN`. When an EN pair exists, it is not shorter than 90% of the RU
volume.

## Gates

Machine-checked today:

- `test/copy-guards.test.ts` sweeps the RU/EN **dictionaries** (chrome, service,
  solution, case copy) for banned lexicon, EN em dash, EN curly quotes.
- `test/services/prose-quality.test.ts` checks service **dictionary** volumes and
  `test/prose-quality.test.ts` checks solutions (RU floor, EN ≥ 90%). Neither
  reads `articles/`.
- `test/astro-content.test.ts` checks dictionary-key parity RU/EN.
- `test/articles.test.ts` reads the article markdown: a categorized article must
  reach its RU genre floor, an EN pair must stay at 90% of RU, no article may
  carry banned lexicon or EN typography, and a published article must have a
  cover `assets/images/articles/<slug>.*` (one without a cover stays `draft: true`; a
  stale `content/generation-queue.json` record is a failure too).
- `test/staleness.test.ts` reads article frontmatter and warns on a link to an
  entity updated after the article.
- `npm run verify:dist` checks `og:image` is a raster, absolute, 1200×630 PNG.

Not machine-checked: semantic quality (marketing fluff, argument), the
two-reader test and AEO. The volume and lexicon rules above are gated; the
argument is judged by the `prose-critic` subagent, which is the primary
editorial gate. It is not CI, so a human still owns the final read.

## Rule homes

One home per rule, so nothing drifts. The filters are read by the writer and by
`prose-critic`.

- `filters/FakeDepthTextFilter.md` — stance, evidence, qualifiers, CTA wording,
  anti-gloss idioms.
- `filters/SyntheticDepthTextFilter.md` — voice, diction, terminology, lexicon,
  code hygiene, empty transitions.
- `filters/NegativeConnotationTextFilter.md` — positive argument, anti-fear,
  legacy-bashing.
- `filters/StructuralSlopTextFilter.md` — sentence- and paragraph-level AI
  tells.
- `filters/TautologyTextFilter.md` — the same claim said twice.
- `filters/AeoTextFilter.md` — query, question, problem-first lead hook that
  carries the answer, and the entity definition in the first 300 characters.
- `filters/PersonaVoiceTextFilter.md` — the argument speaks the row persona's
  metrics.
- `references/acceptance.md` — the article checklist: syntax lint
  (sentence-length rhythm, anaphora), the table/prose split, and the action
  loop.
- `references/structures/` — the six article skeletons; a genre picks from
  them.
- `docs/frontend/prose-quality.md` — canonical full lexicon and structural
  tells, shared with every other page in the repo. The filters point here, they
  do not fork it.
