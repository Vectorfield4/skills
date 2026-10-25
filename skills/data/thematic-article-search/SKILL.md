---
name: thematic-article-search
description: "Step 1 (discovery, topic-filtered) of the news-article chain news-fetcher -> published-check -> article-extractor -> translate-article -> wp-publish, for a plain news site that keeps one articles/<slug>.<lang>.md per locale it ships. Same job as news-fetcher, but takes a required --topic (plus optional --lang/--country) and returns a capped, filtered candidate list instead of the whole feed dump. Search only: no bodies, no drafts, no storage. Triggers: thematic article search, search articles by topic, topic article candidates, article discovery, find articles on topic, find news for the site, свежие новости по теме, найти статьи по теме, добавить статьи."
---

# Thematic article search

Search only. Return candidate links as JSON. Do not translate or write to storage.

## Define sources

Do not hardcode sources. Pass a JSON file with sources. Format:

```json
[
  { "name": "arXiv cs.RO", "url": "http://rss.arxiv.org/rss/cs.RO", "type": "rss" },
  { "name": "Hacker News", "url": "https://hn.algolia.com/api/v1/search?query=robotics&tags=story&hitsPerPage=20", "type": "hn" }
]
```

Set `type` to `rss`, `atom`, `hn`, `html-list` (newsroom index pages without a feed; `html-list` sources also take `selector` and `baseUrl`) or `json-list` (the same list read from a JSON endpoint; also takes `method`/`body`/`itemsPath`/`urlField`/`titleField`/`dateField`/`urlTemplate`/`baseUrl`), see the `news-fetcher` skill. Accept both a bare array and `{ "sources": [...] }`. Default `type` to `rss`. Sources may also carry optional `lang`, `country`, `weight` fields, copied onto each candidate.

## Run

Run from this skill directory:

```bash
node scripts/search.mjs --topic <topic> --sources <sources.json> [--limit N] [--lang <lang>] [--country <country>] [--out file.json]
```

Use an absolute path for `--sources` and `--out` when those files live in a project.

- Require `--topic <topic>`.
- Require `--sources <file.json>`.
- Use `--limit N` to cap the result count.
- Use `--lang <lang>` to filter by candidate `lang`.
- Use `--country <country>` to filter by candidate `country`.
- Use `--out <file.json>` to write JSON to a file. Without it, write JSON to stdout.

## Output

Return `[{ source, title, url, date }]`. Canonicalize URLs. Remove duplicates by canonical URL. Filter by topic keywords of two or more characters and drop common stop words.

Skip a dead feed with `[skip] <name>: <error>` on stderr.

## Constraints

- Discovery and link collection only.
- Do not extract article bodies.
- Do not write to storage.
- Do not translate.
- No repository references.

## Validation

- Run `npm test`.
