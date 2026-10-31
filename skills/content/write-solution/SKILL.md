---
name: write-solution
description: Use when reviewing a solution page's copy with the Jev prose gate вЂ” the RU/EN dictionary in src/entities/solution/i18n/. Runs the per-unit noul checklist, the relevance gate, the note-key check and the FAQ answer-relevance gate, and prints advisory candidates for the solution critic. Triggers: "WriteSolution", "write solution", "review solution", "solution copy", "СѓСЃР»СѓРіР° СЂРµС€РµРЅРёСЏ", "СЂРµРІСЊСЋ СЂРµС€РµРЅРёСЏ", "РїСЂРѕРІРµСЂРёС‚СЊ СЂРµС€РµРЅРёРµ".
---

# WriteSolution

Advisory review of a solution page's copy, symmetric to `write-service`. It
sends the solution dictionary through the shared engine and prints candidate
findings: G1 (per-unit `noul` prose checklist), G2 (relevants fit, plus a
deterministic note-key presence check) and G6 (each FAQ answer answers its
question). It labels candidates; the `service-critic`-style human/editorial read
decides.

The engine and the prose domain live in `lib/jev/` and `lib/prose/`; this skill
owns only its FAQ rubric (`scripts/jev-solution.mjs`), its dictionary parsing
(`scripts/jev-lines.mjs`) and its CLI (`scripts/jev-review.mjs`).

## Scripts

Run from the repo root.

```
node "~/.config/opencode\skills\content\write-solution\scripts\jev-review.mjs" <slug> [--lang ru|en] [--json] [--advisory] [--gate]
node "~/.config/opencode\skills\content\write-solution\scripts\jev-review.mjs" --stdin [--json] [--advisory]
```

- One batched Jev call per solution, split at unit boundaries when the
  dictionary is too large for one request; findings from all chunks merge.
- Prints `[<file>:<line>] <RULE> (<confidence>) вЂ” <text>`. Exits 1 when
  candidates exist, unless `--advisory`; `--gate` maps the `verdict` to
  `0 clean / 10 review / 20 fail` for the circuit breaker.
- `--stdin` reviews a pasted fragment (G1 only).
- Without `RUNWARE_API_KEY` it prints a skip notice and exits 0, so it is safe in
  CI. Advisory only: it never blocks a build.

## Reading the output

- `<FILTER>_CANDIDATE` / `<FILTER>_UNSURE` вЂ” the G1 checklist (see
  `../write-article/references/jev.md`).
- `RELEVANT_FIT_CANDIDATE` вЂ” a linked target the model reads as off-topic.
- `RELEVANT_NOTE_MISSING` вЂ” a relevant with no `noteKey`.
- `FAQ_UNANSWERED_CANDIDATE` вЂ” an answer that does not answer its question.

## Procedure

1. `node "~/.config/opencode\skills\content\write-solution\scripts\jev-review.mjs" <slug> --gate`.
2. Branch on the `verdict`: `fail` в†’ fix the copy (a full critic is skipped);
   `review` в†’ judge each candidate; `clean` в†’ only the advisory findings remain.
3. Re-run until the verdict is `clean` or every remaining hit is accepted.
4. `npm run lint && npm run test`.

## Limits

- Advisory, not a gate; the shared engine is Runware-only.
- G1вЂ“G6 locate candidates; argument, grounding and the two-reader test stay with
  the human/editorial read.
