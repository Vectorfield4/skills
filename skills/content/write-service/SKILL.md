---
name: write-service
description: Use when writing or publishing a service page for the site: drafting its RU/EN copy, generating the backdrop, and removing `draft: true` from the fixture once the backdrop, volume and relevants gates pass. Triggers: "WriteService", "write service", "publish service", "draft exit", "услугу из драфта", "draft: true", "service backdrop", "awaiting generation", "/services/<slug>".
---

# WriteService

A service is scaffolded but hidden: `draft: true` in
`src/entities/service/model/fixtures/<slug>.ts`. It goes live only when a
backdrop exists, the RU/EN copy clears the volume floor, and every relevant
resolves to a published entity. This skill takes one or more services from
scaffold to live page.

Read `src/entities/service/AGENTS.md`, `docs/frontend/i18n.md`, and
`docs/frontend/prose-quality.md` before writing any copy. The editorial gate
below judges against `references/service-prose.md`, which is self-contained on
purpose — it does not load another skill's rules.

## Scripts

Run from the repo root. Both take slugs; with no slugs `audit.mjs` checks every
`draft: true` service.

```
node .opencode/skills/content/write-service/scripts/audit.mjs [slug ...]
node .opencode/skills/content/write-service/scripts/publish.mjs [--dry-run] [--force] <slug ...>
node .opencode/skills/content/write-service/scripts/jev-review.mjs <slug> [--lang ru|en] [--json]
node .opencode/skills/content/write-service/scripts/jev-review.mjs --stdin [--json]
```

- **`audit.mjs`** — readiness check: backdrop file and PNG size (≥1200×630),
  RU ≥ 700 words, EN ≥ 90% of RU, every `relevants[]` target exists and is
  published, and whether the slug's record is still in the generation queue.
  Prints a table, exits non-zero while a blocker remains.
- **`publish.mjs`** — runs the audit, then drops the `draft: true` line from the
  fixture and drops the slug's record from `content/generation-queue.json`. Skips
  a slug that fails audit unless `--force`; `--dry-run` prints the edits without
  writing.
- **`jev-review.mjs`** (advisory) — one batched Jev call returns candidate
  prose-filter and relevants hits for the slug's copy; a shortlist for
  `service-critic`, not a blocker. With `--stdin` it reviews a pasted fragment
  (G1 only) so a block can be checked while it is still being written; pipe the
  prose, not the TS source. Skips without `RUNWARE_API_KEY`. The shared engine is
  `lib/jev/`; rules and thresholds: `../write-article/references/jev.md`.

The volume numbers in `audit.mjs` mirror `test/words.ts`; `npm run test` stays
the source of truth.

## Procedure

1. Cover the backdrop: load the `generate-image-cover` skill and run it with
   `kind=service` and the slug. It dispatches `art-agent`, which authors the
   story, builds the `assets/images/services/<slug>.prompt.txt`, renders through
   the Runware MCP and places `assets/images/services/<slug>.png` (raster
   ≥1200×630, no legible text, calm lower third, subject in the upper two-thirds).
2. Write the RU/EN copy. While a block is still in your buffer, check it inline
   before it lands in the dictionary: `"<prose>" |
   node .opencode/skills/content/write-service/scripts/jev-review.mjs --stdin` returns the
   G1 filter candidates for that fragment. Advisory — fix or accept each hit. Then
   `node .opencode/skills/content/write-service/scripts/audit.mjs <slug> …` — clear
   every ✗. In practice this is RU copy under 700 words: write it up, then
   re-run the audit.
3. **Jev review + circuit breaker:** `node
   .opencode/skills/content/write-service/scripts/jev-review.mjs <slug> --gate`. Branch on
   the `verdict`: `fail` → return to step 2, the critic is skipped; `review` →
   step 4 full gate; `clean` → step 4 light confirm. Advisory findings go to the
   critic; see `../write-article/references/jev.md`. Skips without `RUNWARE_API_KEY`.
4. **Prose gate:** dispatch the `service-critic` subagent with the slug and the
   Jev report. Full pass when `review`; on `clean`, a light confirmation. It reads
   the RU and EN copy and returns a violation log or `VERDICT: PASS`. Fix the log
   and re-run until it passes. A service does not leave draft while the critic
   has an open finding.
5. `node .opencode/skills/content/write-service/scripts/publish.mjs <slug> …`.
6. `npm run lint && npm run test && npm run verify`.

## Prose gate

`service-critic` is the read-only semantic editor, the counterpart of the
article pipeline's `prose-critic`. It owns what a regex cannot judge: grounding,
voice, argument, structure, density and the two-reader test. Its rules live in
`references/service-prose.md` inside this skill; the agent reads only that file
and the slug's `i18n/{ru,en}` copy. After adding the agent file it loads only on
the next OpenCode restart.

## Acceptance criteria

- [ ] Backdrop is a raster 16:9 image, ≥1200×630, no legible text, calm lower
      third; the page emits a raster `og:image` / `twitter:image`.
- [ ] RU copy ≥ 700 words and EN ≥ 90% of RU (`test/services/prose-quality.test.ts`).
- [ ] RU and EN key sets match (`test/astro-content.test.ts`).
- [ ] Every `relevants[]` target exists and is published — no card resolves to a
      draft.
- [ ] `service-critic` returns `VERDICT: PASS` for the slug's RU and EN copy.
- [ ] `draft: true` is gone; the slug's record is gone from
      `content/generation-queue.json`.
- [ ] `lint`, `test`, `verify` are green; `verify:dist` route count grows by two.

## Failure modes

- `test/services/awaiting-generation.test.ts` fails: a published service has no backdrop —
  generate the file or set `draft: true` and restore its
  `content/generation-queue.json` record.
- `test/services/prose-quality.test.ts` fails: RU under 700 words or EN under 90% — write more
  copy; this is a publication gate, not a warning.
- `service-critic` returns a finding: fix the RU/EN copy and re-run it until
  `VERDICT: PASS`; a finding blocks publication, it is not a warning.
- `astro-content.test.ts` fails: an RU key has no EN pair.
- `test/services/services-smoke.test.ts` fails: a base key or a `ctaBanner` key is missing.
- `verify:dist` fails on `og:image`: the backdrop is SVG or smaller than
  1200×630 — regenerate as PNG.
- A relevant card disappears: its target service is still `draft: true`.
