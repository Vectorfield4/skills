---
name: precedent-interview
description: "Generates a fillable precedent questionnaire from the TypeScript contract in lib/content/precedent-questionnaire.ts, validates a filled file against its publication gate, and is the only input a case page or a solution precedent may be written from. Produces data/<domain>/precedent-questionnaire.yaml plus an optional markdown copy. Triggers: precedent interview, precedent questionnaire, опросник кейса, собрать данные кейса, интервью по прецеденту, данные для страницы кейса, заполнить опросник прецедента."
---

# Precedent interview

One job: turn a real, measured project into structured facts before anyone
writes a case page or a solution precedent. The questionnaire is the single
input; the page is written from its answers, never from memory or from a
marketing brief.

## Why this skill exists

The site's precedent policy forbids invented metrics, forecasts, best cases,
client names and "под NDA" labels. Every number on a case card or a solution
precedent needs a baseline, a window, a method and a source. This skill makes
that a data entry task instead of an editorial judgement.

## Files

- Contract: `lib/content/precedent-questionnaire.ts` — the only declaration of
  fields, questions, examples and defaults. Do not duplicate it in a project.
- Generator: `scripts/questionnaire.mjs`
- Gate: `scripts/check-answers.mjs`
- Ensure: `scripts/ensure-questionnaire.mjs`
- Bulk questions: `scripts/bulk-questions.mjs`
- Apply answers: `scripts/apply-answers.mjs`
- Reader: `lib/yaml/utilities/read-yaml.mjs` (and the `.ps1` / `.sh` wrappers)

## Generate

```bash
node scripts/questionnaire.mjs \
  --slug cv-acceptance-control \
  --title "CV-приёмка квартир у субподрядчика" \
  --out data/content/precedent-questionnaire.yaml \
  [--project D:\docs\GitHub\login-ai] \
  [--format yaml|md|both] [--force]
```

- `--slug` is required and must be kebab-case. It becomes the page slug.
- `--out` defaults to `data/<domain>/precedent-questionnaire.yaml`, where
  `<domain>` is the first segment of `--type` (`content` by default).
- `--project` reads `src/shared/i18n/ru/audiences.ts` and the fixture
  directories and prints the allowed slugs and audience keys as a comment
  block. A stale or missing project is a warning, not a stopped run.
- A file that already has content is refused unless `--force` is passed.

## Validate

```bash
node scripts/check-answers.mjs \
  --answers data/content/precedent-questionnaire.yaml \
  [--project D:\docs\GitHub\login-ai] [--strict] [--pretty]
```

The generic reader is also available for any other consumer:

```bash
node lib/yaml/utilities/read-yaml.mjs \
  -type=content/precedent-questionnaire \
  -file=data/content/precedent-questionnaire.yaml [-strict] [-report]
```

Exit codes for both scripts: `0` passed, `1` blocking findings, `2` broken input.

## Gate

`check-answers.mjs` blocks publication on:

- completeness below 80%;
- fewer than one or more than three primary metrics;
- a primary metric without `baseline`, `after`, `window`, `method`;
- `source: estimate` or `confidence: claimed` on a primary metric;
- empty `problem.costOfStatusQuo`, `solution.scope`, `solution.outOfScope`,
  `results.whatDidNotWork`, `commercial.clientOwns`, `publication.relatedServices`,
  `evidence.artifacts`;
- `client.disclosure: name` without a name, or a name without that disclosure;
- `publication.allowed: false` with channels listed (or the reverse);
- a PII artifact without an anonymization note;
- forbidden marketing words in the text ("гарантируем", "лучший",
  "номер один", "революцион", "вырастет на", ...).

It warns on: a primary count that is not exactly three, an estimated
confidence, a measurement window shorter than four weeks, an unresolved slug
against the project, an audience key that is not declared in the project.

## Bulk interview (when a draft exists)

After `ensure-questionnaire.mjs` returns 1, the file is a template. Collect every
empty field at once:

```bash
node scripts/bulk-questions.mjs --file data/content/precedent-questionnaire.yaml
```

- Exit `0` — a JSON object `{ total, questions: [...] }`. Each question has
  `path`, `question`, `example`, `allowed`, `line`, `search`.
- Exit `1` — every required field is filled. Run `check-answers.mjs`.

**Grouping.** Do not ask 50 separate questions. Group related fields into one
question per logical block and let the user answer in a compact form:

- `client.industry`, `client.region` → "Отрасль и регион".
- `problem.beforeProcess`, `problem.trigger` → one question each (long text).
- `problem.costOfStatusQuo[0..n]` → "Затраты (статья | значение | источник)".
- `solution.oneLiner`, `solution.scope`, `solution.outOfScope`, `solution.services`
  → one each (scope/outOfScope/services — через запятую).
- `timeline.kickoff` → one question.
- `results.primary[0..2]` → **one question per metric**:
  "Метрика (название | единица | до | после | метод | источник)".
- `results.whatDidNotWork` → one question (через запятую).
- `commercial.packageSold`, `commercial.clientOwns` → one each.
- `evidence.artifacts[0]` → "Артефакт (тип | путь | примечание)".
- `publication.relatedServices` → one question (через запятую).

This keeps the whole interview to ~15 questions in a single `question` tool call.

After collecting answers, write them all at once:

```bash
node scripts/apply-answers.mjs --file data/content/precedent-questionnaire.yaml \
  --answers answers.json
```

where `answers.json` is `{ "path": value, ... }` (arrays as JSON arrays).
Then run `check-answers.mjs`. Comments in the YAML are preserved.

## Rules

- Never invent a number, a client name, a metric or a result. Empty fields stay
  empty until the client confirms them; the gate reads an empty field as a
  blocker, not as a zero.
- One file per case. Do not append a second case to an existing questionnaire.
- `results.primary` holds the three numbers that go on the case card. Extra
  numbers go to `results.secondary`.
- `results.whatDidNotWork` is mandatory and must contain at least one entry. A
  case with no stated limits is a brochure, not a precedent.
- `client.disclosure` is decided before any text is written. Changing it after
  the page is drafted means rewriting the page.
- The questionnaire is the input to a case page and to one element of a
  solution's `precedents` array. It is not published itself.

## Ensure before writing

```bash
node scripts/ensure-questionnaire.mjs --slug <slug> [--project <path>]
```

- Exit `0` — a filled questionnaire exists; proceed to writing the page.
- Exit `1` — a template was generated (or the file is still in draft state);
  fill it in, set `status: filled`, run `check-answers.mjs`, then write.
- Exit `2` — broken input.

This is the gate every case page and solution precedent passes through: no
filled questionnaire, no page.

A later `normalize.mjs` will read a passed questionnaire and emit drafts of the
case fixture, the RU/EN dictionary keys and the precedent element. It is not
shipped in this version; until it lands, the page is written by hand from the
passed file, field by field.

## Validation

- `node --check scripts/questionnaire.mjs`
- `node --check scripts/check-answers.mjs`
- `node --check lib/yaml/utilities/read-yaml.mjs`
- `node --check scripts/ensure-questionnaire.mjs`
- `node --check scripts/bulk-questions.mjs`
- `node --check scripts/apply-answers.mjs`
- In the skills repo: `npm test`
