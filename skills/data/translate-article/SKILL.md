---
name: translate-article
description: "Step 4 (translation) of the news-article chain news-fetcher -> published-check -> article-extractor -> translate-article -> wp-publish: turns a parsed article into each language the site ships — for example the articles/<slug>.ru.md article and, only when the site serves English too, its articles/<slug>.en.md mirror. Translates an article or text from a source language to a target language (RU/EN and others). Input is source text plus source and target language codes, with an optional glossary. Output is the translated text plus metadata. Translation only: no article generation, no draft writes, no publishing. Triggers: TranslateArticle, translate article, translate text, translate, translation, localize, локализовать, перевести статью, перевести текст, перевод, сделать английскую версию, сделать русскую версию."
---

# Translate article

Translates a given text or article from `source_lang` to `target_lang`. This skill
performs translation only. It does not write articles, drafts, or source specs,
and it does not publish or change any draft flag.

End-to-end runs are owned by the `content-translate-related-articles` agent; run this skill
alone only when the caller hands you text and asks for the other language.

## Input

- `source_text` (string, required unless `source_file` is given) - text to
  translate.
- `source_file` (path, optional) - path to the input file. When given, read the
  file and translate its contents.
- `source_lang` (string, required) - source language code (for example `ru`,
  `en`, `de`).
- `target_lang` (string, required) - target language code (for example `ru`,
  `en`, `de`).
- `glossary` (object, optional) - map of source term to target term. When
  provided, these mappings override the built-in glossary.
- `slug` (string, optional) - slug used for the artifact path.
- `out` (path, optional) - explicit output path. When omitted and a `slug` is
  given, use the artifact contract below.

## Output

- `translated_text` (string) - translated text.
- `metadata` (object):
  - `source_lang`, `target_lang`
  - `glossary_source` - `provided`, `built-in`, or `none`
  - `terms_applied` - list of glossary terms that were applied
  - `uncertain_terms` - list of terms where no confident mapping existed
  - `source_chars`, `translated_chars`
  - `notes` - short notes about formatting or untranslatable fragments

## Built-in glossary

When `glossary` is not provided, use this minimal robotics glossary (RU to EN).
Apply it in the direction implied by `source_lang` and `target_lang`. Match terms
case-insensitively as whole words and preserve the original casing in the output.

| RU | EN |
| --- | --- |
| робот | robot |
| манипулятор | manipulator |
| привод | actuator |
| датчик | sensor |
| энкодер | encoder |
| кинематика | kinematics |
| траектория | trajectory |
| захват | gripper |
| локализация | localization |
| навигация | navigation |
| одометрия | odometry |
| SLAM | SLAM |
| телеметрия | telemetry |
| сервопривод | servo |
| калибровка | calibration |
| рабочая зона | work envelope |
| степень свободы | degree of freedom |
| конечный эффектор | end effector |

This glossary is minimal. A caller may pass a larger domain glossary through
`glossary`.

## Artifact contract

When translating files, use this standardized path:

- Input: `docs/research/<slug>.<source_lang>.md` or `docs/research/<slug>.<source_lang>.json`
- Output: `docs/research/<slug>.<target_lang>.md` or `docs/research/<slug>.<target_lang>.json`

Preserve the file extension. When `out` is given, write to `out` instead. When no
`slug` and no `out` are given, return the result in the response only and do not
write a file.

## Process

1. Validate `source_lang` and `target_lang`. They must differ. If `source_lang`
   is missing, infer it from the text and record the inference in `metadata.notes`.
2. Load the text from `source_text` or `source_file`.
3. Select the glossary: use `glossary` when provided, otherwise the built-in
   glossary, otherwise none.
4. Translate the text with an LLM. Preserve all structure:
   - Markdown headings, lists, tables, code blocks, and inline code.
   - URLs, file paths, identifiers, and code snippets stay unchanged.
   - Numbers and units stay unchanged unless the glossary says otherwise.
   - Proper nouns stay unchanged unless a glossary mapping exists.
   - Frontmatter keys stay unchanged; translate only human-readable values.
5. Apply glossary mappings consistently. Record applied terms in
   `terms_applied`.
6. List terms with no confident mapping in `uncertain_terms`.
7. Write the output file when `out` or `slug` is given. Do not overwrite the
   source file.
8. Return `translated_text` and `metadata`.

## Constraints

- Translation only. Do not summarize, rewrite, or add content.
- Do not generate articles or drafts.
- Do not edit or delete source files.
- Do not change draft flags or publish anything.
- Do not translate code, URLs, identifiers, or file paths.
- Do not convert numbers or units unless the glossary requires it.
- Keep the original meaning and tone.

## Validation

- `target_lang` of the output matches the requested target language.
- All glossary terms present in the source appear with their mapped form.
- Numbers and units are unchanged.
- Markdown structure is preserved (same headings, lists, tables, code blocks).
- Output path follows the artifact contract when a file is written.
- Source file is untouched.