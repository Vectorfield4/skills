---
name: article-extractor
description: "Step 3 (body) of the news-article chain news-fetcher -> published-check -> article-extractor -> translate-article -> wp-publish: extracts clean article text from any candidate URL using Mozilla Readability (no API keys). Use when you need the full body of a web article before summarizing, rewriting or translating it into articles/<slug>.ru.md. Triggers: article extractor, extract article, fetch article body, get article text, read the source article, извлечь статью, вытащить текст статьи, распарсить статью."
---

# Article Extractor

Universal, key-free article text extraction. Mozilla Readability + jsdom, run from
`scripts/extract-article.mjs` in this skill.

Candidate URLs come from the `news-fetcher` skill; this one fetches the body.
End-to-end runs are owned by the `content-translate-related-articles` agent; run this skill
alone only when the caller already has URLs and wants the text.

## When to use

- You have a candidate URL and need its full text.
- You need to summarize or translate an article before publishing.
- The source has no RSS/JSON (company blogs, news sites, Papers With Code).

## Run

From the project root:

```bash
node ~/.config/opencode/skills/data/article-extractor/scripts/extract-article.mjs \
  https://example.com/article --out article.json
```

Without `--out` the JSON goes to stdout.

## Output (JSON)

- `title`, `byline`, `excerpt`, `content` (HTML), `textContent` (plain text),
  `siteName`, `url`
- On failure: `{ error, url }` — a network error or "Could not extract article".

## Notes

- Sends a browser-like User-Agent, 20 s timeout. Some sites still block it.
- jsdom's virtual console is silenced: unparsable stylesheets would otherwise dump
  hundreds of KB of CSS to stderr.
- Readability returns partial content on heavily scripted pages — fall back to raw
  fetch + manual cleanup when the text looks truncated.
- Dependencies (`jsdom`, `@mozilla/readability`) belong to the skills repo root
  `package.json`; run `npm install` there once after cloning.

## Tests

`npm test` in `D:\docs\GitHub\skills`.
