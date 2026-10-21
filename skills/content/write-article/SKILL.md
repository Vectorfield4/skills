---
name: write-article
description: Use when writing or publishing a news article for the blog (articles/<slug>.ru.md / .en.md) — picking a genre, assembling the spec, drafting RU and the EN mirror, wiring links and cover, and clearing the prose gates. Triggers: "WriteArticle", "write article", "news article", "написать статью", "новый разбор", "пост в новости", "материал по плану", and genre names: product, research, technical, case-study, corporate, industry, media, community.
---

# WriteArticle

Operationalizes the methodology of the «Новости и разборы» section. One article
is one genre, one structure, one funnel stage. The skill turns a calendar row
from `content/plan/` (the persona JSON plus `index.json`) into a published RU/EN
pair. An article
goes live only when a cover exists, the RU/EN copy clears the genre floor, and
every related target is published — the same three gates a service passes.

## Read first

- `references/common.md` — the skeleton and composition rules every genre obeys.
- `references/filters/` — the semantic gates: `FakeDepthTextFilter.md`,
  `SyntheticDepthTextFilter.md`, `NegativeConnotationTextFilter.md`,
  `StructuralSlopTextFilter.md`, `TautologyTextFilter.md`, `AeoTextFilter.md`,
  `PersonaVoiceTextFilter.md`.
- `references/spec-template.md` — the 12-section spec card.
- `references/genres/<genre>.md` — the block for the chosen genre.
- `references/acceptance.md` — spec and article acceptance checks.
- `docs/frontend/prose-quality.md`.

## Genres

Genre and funnel are independent axes: the table below is the assembly format
(structure and volume), and the stage is only a typical fit. The funnel comes
from the calendar row, so a `product` release can be `HoFu` (retention) in
`PSI`, not `BoFu` (sale). See `docs/content-plan.md`.

| Genre | Typical stage | Structure | RU volume |
| --- | --- | --- | --- |
| `product` | решение / выбор | PSI или How-To | 600–900 |
| `research` | охват | PSI, Breakdown или Journey | 900–1500 |
| `technical` | выбор / охват | Breakdown или How-To | 1000–1500 |
| `case-study` | решение | PSI или Journey | 900–1300 |
| `corporate` | охват | PSI или Journey | 600–900 |
| `industry` | охват / выбор | Comparison или Breakdown | 900–1400 |
| `media` | охват | Breakdown | 500–900 |
| `community` | охват | PSI | 500–800 |

## Scripts

Run from the repo root. `audit.mjs` and `publish.mjs` take slugs; with no slugs
`audit.mjs` checks every draft article. `density.mjs` is the numeric companion
to the syntax gates.

```
node .opencode/skills/content/write-article/scripts/audit.mjs [slug ...]
node .opencode/skills/content/write-article/scripts/publish.mjs [--dry-run] [--force] <slug ...>
node .opencode/skills/content/write-article/scripts/density.mjs <file...> [--json] [--verbose]
node .opencode/skills/content/write-article/scripts/jev-review.mjs <slug> [--lang ru|en] [--json] [--gate]
node .opencode/skills/content/write-article/scripts/jev-review.mjs --stdin [--json]
node lib/prose/eval.mjs
```

- **`audit.mjs`** — readiness check: cover file and PNG size (≥1200×630), RU ≥
  the genre floor, EN ≥ 90% of RU, every `relatedServices` / `relatedSolutions` /
  `relatedCases` target exists and is published, at least one such link, and
  whether the slug's record is still in the generation queue. Prints a table,
  exits non-zero while a blocker remains.
- **`publish.mjs`** — runs the audit, then sets `draft: false` in `<slug>.ru.md`
  and `<slug>.en.md` and drops the slug's record from
  `content/generation-queue.json`. Skips a slug that fails audit unless
  `--force`; `--dry-run` prints the edits.
- **`density.mjs`** — words, sentences, lines, paragraphs, headings, table rows
  and characters, plus the derived ratios (words per sentence, sentences per
  paragraph, characters per word) and the longest sentence. Frontmatter,
  headings and table rows are excluded from the word and sentence counts;
  ordered-list markers are not sentences. With no path it scans every
  `articles/*.{ru,en}.md`.
- **`jev-review.mjs`** — one batched Jev call per document returns the G1 prose
  checklist, the Phase 4 semantic sensors, genre/structure, relevants, metadata
  and a circuit-breaker `verdict` (`fail` / `review` / `clean`). `--gate` maps the
  verdict to an exit code. Advisory findings are a shortlist for the prose gate,
  not a blocker. With `--stdin` it reviews a pasted fragment (G1 only). Skips
  without `RUNWARE_API_KEY`. Rules and thresholds: `references/jev.md`; the shared
  engine is `lib/jev/`, calibrate with `node lib/prose/eval.mjs`.

The volume and cover numbers in `audit.mjs` mirror `test/articles.test.ts`;
`npm run test` stays the source of truth.

## Procedure

1. Pick the genre and funnel stage from the calendar row.
2. Load `references/common.md`, `references/filters/*.md`,
   `references/spec-template.md`, and the genre reference. Assemble the spec.
   Run `references/acceptance.md`. Stop for approval if the row lacks a number
   or a link target.
3. Write RU first. One structure, one CTA, a number in every claim. As each
   section is drafted, check it inline before it lands in the file:
   `"<section>" | node .opencode/skills/content/write-article/scripts/jev-review.mjs --stdin`
   returns the G1 filter candidates for that fragment. Advisory — fix or accept
   each hit.
4. Write the EN mirror when the calendar row is marked `RU+EN`; it is not
   shorter than 90% of the RU volume. When an EN pair exists, that floor holds.
5. **Cover gate (mandatory — do not stop before it).** Load the
   `generate-image-cover` skill and run it with `kind=article` and the slug. It
   dispatches `art-agent`, which authors a structured `visual_config` and ten
   English `keywords` (each a key of `docs/image-prompts/keyword-motifs.mjs`)
   into the queue record, builds `assets/images/articles/<slug>.prompt.txt` from
   `content/generation-queue.json`, renders through the Runware MCP and places
   `assets/images/articles/<slug>.png`. **A draft is not finished until this step
   ran: until that PNG exists the article stays a draft** (`draft: true`, the
   schema default) — a live article without a cover is a bug.
6. Set frontmatter: `title` (10–120), `description` (50–300), `publishedAt`,
   `category`, `tags`, `excerpt`, `featured`, and `mediaUrl` for media.
   `relatedServices` / `relatedSolutions` / `relatedCases` take slugs of
   published entities. A new article is a draft by default: the field is absent
   or `draft: true`, and it takes `draft: false` only at publication. `author`
   stays empty (default team by locale).
7. `node .opencode/skills/content/write-article/scripts/audit.mjs <slug> …` — clear every
   ✗. In practice this is the cover, a short genre floor, or a related target
   still in draft; fix it, then re-run the audit.
8. **Jev review + circuit breaker:** `node
   .opencode/skills/content/write-article/scripts/jev-review.mjs <slug> --gate`. Branch on
   the `verdict` (exit `0 clean / 10 review / 20 fail`):
   - `fail` (a G1 `_CANDIDATE` or a genre/structure mismatch) → return to step 3
     and fix the draft; **do not dispatch the critic**.
   - `review` (a G1 `_UNSURE`) → go to step 9, the full prose gate.
   - `clean` → go to step 9 in light-confirm mode (the critic checks only the axes
     the sensors cannot judge).
   Advisory findings (sensors, metadata, relevance) are forwarded to the critic.
   Skips without `RUNWARE_API_KEY`; see `references/jev.md`.
9. **Prose gate:** dispatch the `prose-critic` subagent on the draft, passing the
   Jev report. Full pass when the verdict is `review`; on `clean`, a light
   confirmation (only `common.md` + `acceptance.md` and the uncovered axes). It is
   the primary editorial gate: fix the returned violation log and re-run until
   `VERDICT: PASS`. The agent loads only after an OpenCode restart once its file
   is added.
10. `node .opencode/skills/content/write-article/scripts/publish.mjs <slug> …`.
11. `npm run lint && npm run test && npm run verify`.

## Prose gate

`prose-critic` is the read-only semantic editor, the counterpart of the service
pipeline's `service-critic`. It owns what a regex cannot judge: marketing fluff,
argument, structure, the two-reader test and AEO. Its rules live in `references/`
inside this skill; the agent reads `common.md`, `acceptance.md`, the draft's
genre and structure, and the filters. After adding the agent file it loads only
on the next OpenCode restart.

## Acceptance criteria

- [ ] One genre, one structure from `references/structures/`, one funnel stage.
- [ ] RU ≥ the genre floor; an EN pair, when present, ≥ 90% of RU.
- [ ] Every benefit claim carries a number, source, or explicit limit.
- [ ] At least one commercial link; every related target exists and is
      published — no card resolves to a draft.
- [ ] No banned lexicon or negation-based reasoning.
- [ ] `prose-critic` returns `VERDICT: PASS`.
- [ ] `category`/`excerpt` match the schema; `mediaUrl` for media.
- [ ] Cover present (`assets/images/articles/<slug>.png`); no cover means the article
      stays a draft with its `content/generation-queue.json` record. The record
      carries a structured `visual_config` and exactly ten English keywords, each
      a key of `docs/image-prompts/keyword-motifs.mjs`.
- [ ] `lint`, `test`, `verify` green.

## Failure modes

- `copy-guards.test.ts` fails: banned lexicon or EN typography inside a
  **dictionary** string (chrome, service, solution, case). Article markdown is
  not swept by it.
- `test/prose-quality.test.ts` fails: a solution **dictionary** misses its RU
  floor or its EN mirror drops under 90%; the service guard is
  `test/services/prose-quality.test.ts`. Neither measures articles.
- `astro-content.test.ts` fails: a dictionary key exists in one language only.
- `articles.test.ts` fails: a categorized article is under its RU genre floor, an
  EN pair is under 90% of RU, an article carries banned lexicon or EN
  typography, or a published article links a draft or missing entity. Its
  "cover gate" fails when a published article has no cover — generate the PNG or
  return the article to draft (`draft: true`) and restore its
  `content/generation-queue.json` record; it also fails a stale record whose
  cover already exists.
- `audit.mjs` fails: no cover, a cover under 1200×630, RU under the genre floor,
  EN under 90% of RU, no related link, or a related target still in draft.
- `staleness.test.ts` warns: the article links an entity updated after it.
- `verify:dist` fails on `og:image`: cover is SVG or not a 1200×630 PNG.
- A relevant card disappears: its target entity is still `draft: true` — publish
  the target first, or keep the article a draft (`dropDraftLinks` unwraps the
  link; it returns on publication).
- The suite checks volume and lexicon only. Editorial quality, the two-reader
  test and AEO are not machine-checked; the `prose-critic` pass and a human hold
  those.
