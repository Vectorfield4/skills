# Jev review (advisory prose gate)

A skill's `scripts/jev-review.mjs` is a cheap, online pre-pass over a draft. It
asks the TypeSafe System One model `Jev` (`typesafe:jev@1`, served by Runware at
`POST https://api.runware.ai/v1/decisions`) a batch of typed questions about one
document and prints candidate findings. It is **advisory**: the candidates are a
shortlist for the `prose-critic` / `service-critic` gate, never a blocker on
their own.

The engine is shared and domain-free: `lib/jev/` holds the transport
(`client.mjs`), the thresholds (`thresholds.mjs`), the question factories
(`questions.mjs`), the answer→finding collectors (`findings.mjs`), the report
(`report.mjs`), the one-call runner (`review.mjs`) and the CLI harness
(`cli.mjs`). The shared content rubrics live in `lib/prose/` — filters,
relevance, line extractors, target lookup and the inline
`reviewText`. Both directories sit in the skills repo, one level from its root,
and a skill script imports them through the `#lib/*` alias declared in that
repo's `package.json` (`"imports": { "#lib/*": "./lib/*" }`), e.g.
`#lib/jev/findings.mjs`. Each skill owns only its gates and CLI in its
`scripts/`: `write-article` adds genre/structure/AEO, `write-service` adds
the block semantics, `code-quality` adds SOLID/SoC over source.

Because the alias resolves from the nearest `package.json`, there is no workspace
package and no `node_modules` link: `npm install` in the skills repo cannot remove
the gate code, and no package-name specifier remains (`test/module-graph.test.mjs`
guards both). Content is a different story — `articles/`, `src/entities/...` and
`content/plan/` are opened relative to `process.cwd()`, so file-mode reviews run
from the project root, not from the skills repo.

## Why it exists

`test/articles.test.ts` and `test/services/prose-quality.test.ts` check volume,
lexicon and typography — deterministic rules. The semantic rules (grounding,
argument, structure, relevance) are judged by the critic subagents, which read
many reference files. Jev collapses that first pass into **one batched request
per document**, so the critic starts from a shortlist instead of a blank page.

## Commands

```
node .opencode/skills/content/write-article/scripts/jev-review.mjs <slug> [--lang ru|en] [--json] [--advisory]
node .opencode/skills/content/write-service/scripts/jev-review.mjs <slug> [--lang ru|en] [--json] [--advisory]
node .opencode/skills/content/write-article/scripts/jev-review.mjs --stdin [--json] [--advisory]
node .opencode/skills/content/write-service/scripts/jev-review.mjs --stdin [--json] [--advisory]
node lib/prose/eval.mjs
```

The review CLIs run from the content project (`articles/`, `src/entities/...`);
`eval.mjs`, `calibrate.mjs` and the calibration fixtures belong to the skills
repo, so run those from `D:\docs\GitHub\skills`.

- `--advisory` forces exit 0 even with candidates; without it the CLI exits 1
  when candidates exist (so `publish.mjs --jev` can gate on it).
- `--stdin` reads the draft from standard input instead of a slug. It runs the
  per-unit filter sweep (G1) only — genre, structure, AEO and the relevance gate
  need the file's frontmatter and linked targets — so a section can be checked
  the moment it is written, before it reaches disk. Findings are reported against
  `(stdin)` with the paragraph line in the pasted text.
- G1 is a per-unit `noul` checklist: the violation probability `p = answer.noul`
  is read across two corridors — `p ≥ 0.8` is a `<FILTER>_CANDIDATE`, the
  `0.65 ≤ p < 0.8` dead zone yields one `<FILTER>_UNSURE` per prose unit (skipped
  for fragments under six words), and below the dead zone the unit is clean.
- `--gate` maps the report `verdict` to an exit code — `0 clean`, `10 review`,
  `20 fail` — so a procedure can branch on it; the default exit stays advisory.
- Without `RUNWARE_API_KEY` every command prints a skip notice and exits 0 — CI
  and offline runs never touch the network.
- `--lang` defaults to `ru`; the EN mirror is a separate run.

## Gates

One `POST /v1/decisions` carries every question; TypeSafe evaluates them in
parallel and reads `state` once.

| # | Gate | Primitive | Fires when |
| --- | --- | --- | --- |
| G1 | Per-unit prose filters | `noul` ×N | `p ≥ 0.8` → `_CANDIDATE`; `0.65 ≤ p < 0.8` → `_UNSURE` |
| G2 | Relevants fit (article links / service `relevants[]`) | `noul` | `noul ≤ 0.2` (confident "not relevant") |
| G3 | Genre / structure (article only) | `choice` | reads differently from `category`, or a structure the genre forbids |
| G4 | AEO lead hook (article only) | `noul` ×2 | `noul ≤ 0.2` |
| G5 | Service block semantics | `noul` | `mechanism` reads as a fragment, a block title misses its text, or a `sections` item is not a sentence |
| G8 | Semantic sensors (two readers, grounding, AEO, terminology, argument) | `noul` | a document/unit sensor below its corridor (`lib/prose/sensors.mjs`) |

The shared G1 rubrics live in `lib/prose/prompts.mjs`; the sensors in
`lib/prose/sensors.mjs`; the thresholds in `lib/jev/thresholds.mjs`. The
genre/structure/AEO rubrics live in `write-article/scripts/jev-article.mjs`, the
service block rubrics in `write-service/scripts/jev-service.mjs`, the FAQ rubric
in `write-solution/scripts/jev-solution.mjs`. Change a rubric
in its one home and bump its prompt version, then run `eval.mjs`.

## Verdict (circuit breaker)

Every report carries `verdict`:

- **`fail`** — at least one `fail`-severity finding (a G1 `_CANDIDATE` or a
  genre/structure mismatch). Return the draft to the writer; the expensive critic
  is not called.
- **`review`** — a `review`-severity finding (a G1 `_UNSURE`, or a weak AEO lead
  hook from G4 — the one signal that matched the critic on a real draft). Dispatch
  the full critic.
- **`clean`** — no gating finding. Run the deterministic suite and a light critic
  confirmation of the axes sensors cannot judge (`argument_holds`), not a full
  sweep.

Sensors (G8), metadata, relevance and parity findings are currently **`advisory`**:
they are reported and forwarded to the critic, but they do not move the verdict.
A sensor corridor gates nothing until a calibration pass promotes a signal to
`fail`/`review`; the harness and corpus live in `lib/prose/calibrate.mjs` and
`lib/prose/calibration-fixtures.json`.

## Output

```
[articles/<slug>.ru.md:19] SYNTHETIC_DEPTH_CANDIDATE (0.83) — System One-модели …
[articles/<slug>.ru.md:1] STRUCTURE_MISMATCH (0.77) — reads as PSI; technical allows Breakdown/How-To
```

`rule`, `confidence` and the offending text/line. The reason stays with the
critic; Jev only locates candidates.

## Calibration

`lib/prose/eval.mjs` runs `eval-fixtures.json` (synthetic cases from
`references/filters/*` plus real, gate-passed paragraphs as negative controls)
through **both** question shapes over the same fixtures — the production `noul`
checklist and the legacy dominant-label `choice` — and prints both accuracies,
their agreement and a per-filter confusion matrix. The first dual run scored
`noul 15/16`, `legacy 15/16`, agreement `15/16` (the single miss is one fixture
whose expected label is genuinely ambiguous). Tune the two corridors in
`lib/jev/thresholds.mjs` (`violation.act`, `violation.review`).

**Semantic sensors.** `node lib/prose/calibrate.mjs` runs
`lib/prose/calibration-fixtures.json` (`{ sensor, text, label }`) through the
sensors and prints precision/recall at the corridor plus a boundary sweep: a
false-positive sensor is tuned by moving `THRESHOLDS.sensor`, or rephrased when
its real/false distributions overlap. Target **≥ 15–20 labeled units per
sensor** before promoting it from `advisory` to `fail`/`review`.

**The corpus grows by itself.** Every file review appends its firings to
`.cache/jev-calibration/firings.jsonl`; publishing labels them — a flagged unit
still present in the published text is `false`, an edited one is `real` — into
`.cache/jev-calibration/labeled.jsonl`. This is a bootstrap, not an oracle: the
`edited` heuristic is noisy and only firing units are recorded, so a human pass
over a sample still owns the gold rows that go into `calibration-fixtures.json`.

## Limits

- Jev does not explain, rank or rewrite; it labels. It cannot replace the critic.
- The inline (`--stdin`) pass covers G1 only; run the file-level review before
  the prose gate so G2–G5 are checked too.
- `noul` gate answers are noisier than `choice`; keep the corridors narrow, skip
  the dead zone on short fragments, and treat every hit as a question for a
  human.
- A document with too many units for a single request is split at unit
  boundaries (one request per chunk, merged into one report); this is the only
  case where a review fans out to several requests.
- The gates burn tokens, so they never run in `npm run test`. The live end-to-end
  contour is `npm run test:integration`, which spawns every Jev CLI and writes a
  log under `.cache/jev-integration/`.
- G5 covers `mechanism` paragraphs, block titles and `sections` items; other
  block-level rules stay with `service-critic`.
