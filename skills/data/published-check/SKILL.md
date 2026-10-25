---
name: published-check
description: "Step 2 (coverage) of the news-article chain news-fetcher -> published-check -> article-extractor -> translate-article -> wp-publish, for a plain news site that keeps one articles/<slug>.<lang>.md per locale it ships. Answers one question before parsing or translating: does this story already have a published article (and a translation for every other locale the site serves)? Matches a candidate against the project's articles/ archive (source_url, frontmatter slug, normalized title) and, optionally, an existing WordPress post dump. Returns { fresh, covered } with the match reason, so nothing is translated or published twice. Triggers: published check, was it published, already covered, duplicate check, has the translation been published, не публиковали ли, проверка публикаций, дубликаты статей."
---

# Published check

Coverage step of the news-article chain. The fetcher says what is out there; this
skill says what of it is already on the site.

Read-only: it never writes an article, never translates, never touches
WordPress. It only splits a candidates file in two.

## Run

```bash
node scripts/check.mjs --file docs/research/candidates.json \
  [--articles articles] [--wp docs/wp-posts.json] [--out docs/research/coverage.json]
```

- `--file` — `news-fetcher` / `thematic-article-search` output.
- `--articles` — the project's article directory, default `articles`.
- `--wp` — optional dump of existing posts, `[{ "slug", "title", "status", "link" }]`
  or `{ "posts": [...] }`; use it when the site may hold posts that never landed
  in the markdown archive.
- `--out` — write the result instead of printing it.

## Match order

1. `source_url` in any `articles/<slug>.<lang>.md` frontmatter, canonicalized
   (protocol, trailing slash and tracking params are ignored).
2. The URL's own slug against the pair's slug.
3. Normalized title equality against a pair's `title`.
4. The same three checks against the WordPress dump: `link`/`source_url`, `slug`,
   `title`.

A pair counts as covered in either language: `ru` alone means the translation is
still missing, which the caller finishes instead of re-fetching the story.

## Output

```json
{
  "fresh": [{ "source": "...", "title": "...", "url": "...", "date": "..." }],
  "covered": [
    {
      "source": "...", "title": "...", "url": "...", "date": "...",
      "matched": { "kind": "source_url", "slug": "figure-helix-2-5", "file": "figure-helix-2-5.ru.md", "status": "published" }
    }
  ]
}
```

`matched.status` is the frontmatter `status` (`draft` or `published`) or the WP
post status. A `draft` match means "started, not live" — finish that pair, do not
create a second one.

## Constraints

- Read only. No network, no WordPress calls, no translation.
- Do not delete or rewrite archive files.
- Exit non-zero only on bad input (missing candidates file, unreadable archive).
