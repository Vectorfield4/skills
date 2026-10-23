---
name: article-research
description: "Orchestrates topic + country research and returns a research pack of the most important articles. Does not write articles, drafts, or source specs."
---

# Article Research

Orchestrator for finding the most important articles on a topic in a country (or
worldwide). It does not write articles, touch drafts, or write source specs. It
returns a research pack that `write-article` consumes.

`source-discovery` is expected to exist (created in parallel). This skill
delegates discovery to it and does not duplicate `websearch` itself.

## Role

- Research orchestrator: topic + country.
- Returns a research pack (JSON).
- No article writing, no draft mutation, no source-spec authoring.

## Input

- `topic` (required) — research topic.
- `country` (optional) — country scope.
- `lang` (optional) — preferred language.
- `kinds` (optional) — source kinds to consider.
- `limit` (optional, default 8) — cap on candidates.
- `out` (optional) — output path for the research pack. Default is
  `docs/research/<slug>.json` in the project, but this skill does not know the
  project path, so pass `out` explicitly.

## Steps

1. Call `source-discovery` with `anchor=topic-country`, passing `topic`,
   `country`, `lang`, `kinds`, `limit`, and `context`. One call per run (repeat
   only if needed).
2. Merge candidates from the discovery result and dedup by `url`.
3. Filter by `lang` / `country` when those are provided.
4. Score each candidate as `weight * recencyFactor(date)`, using
   `recencyFactor` from `lib/article-search.mjs`. Mark `score`.
5. LLM rerank the top-20 by importance for the topic; set `selected=true` for
   the top-N.
6. For selected candidates, optionally extract bodies via `article-extractor`;
   store `extracted` or `{ error }`.
7. For candidates whose `lang` differs from the target language, translate
   `title` + text (LLM step); keep both the original and the translation.
8. Write the research pack (when `out` is given) and print the handoff for
   `write-article`: suggested slug, pack path, genre candidate.

## Research pack contract

```json
{
  "topic": "...",
  "targetLang": "...",
  "generatedAt": "...",
  "candidates": [
    {
      "source": "...",
      "title": "...",
      "url": "...",
      "date": "...",
      "lang": "...",
      "country": "...",
      "weight": 1.0,
      "score": 0.0,
      "selected": false,
      "extracted": null,
      "translation": null,
      "status": "..."
    }
  ]
}
```

Fields per candidate: `source`, `title`, `url`, `date`, `lang`, `country`,
`weight`, `score`, `selected`, `extracted?`, `translation?`, `status`.

## Interface with write-article

This skill never writes an article. Its handoff prints:

- suggested slug;
- path to the research pack;
- genre candidate (`news` → `media`/`industry`, `разбор` → `research`).

`_source_url` in the downstream article points to the original `url` taken from
the pack.

## Constraints

- Discovery is delegated to `source-discovery`; do not duplicate `websearch`.
- Do not write a source spec.
- One `source-discovery` call per run (may be repeated when necessary).
- No script (`research.mjs`) ships with this skill; orchestration lives here.

## Validation

- Run `npm run doctor`.
