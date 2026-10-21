---
name: news-fetcher
description: "Collects news candidate links from RSS/Atom feeds and Hacker News without API keys. Takes a source list you provide and returns deduplicated JSON (source, title, url, date). Use for discovery — deciding what to write about."
---

# News Fetcher

Discovery step of the article pipeline. Turns a list of feeds into one deduplicated
JSON array of candidate links. Plain `fetch`, no API keys, no dependencies.

Article bodies are a separate skill: `article-extractor`.

## Sources are data, not code

The fetcher ships **no** built-in sources — a hardcoded feed list is exactly what
makes a "universal" fetcher useless in the next project. Each project keeps its own
JSON:

```json
[
  { "name": "arXiv cs.RO", "url": "http://rss.arxiv.org/rss/cs.RO", "type": "rss" },
  { "name": "Hacker News", "url": "https://hn.algolia.com/api/v1/search?query=robotics&tags=story&hitsPerPage=20", "type": "hn" }
]
```

`type` is one of:

| type | expected body |
|---|---|
| `rss` | RSS 2.0 XML |
| `atom` | Atom XML |
| `hn` | Hacker News Algolia search JSON (`hits[]`) |

Both a bare array and `{ "sources": [...] }` are accepted. `type` defaults to `rss`.

## Run

From the project root:

```bash
node .opencode/skills/data/news-fetcher/scripts/fetch-candidates.mjs \
  --sources scripts/sources.json --out candidates.json
```

- `--sources <file.json>` — required.
- `--out <file.json>` — optional; without it the JSON goes to stdout.

## Output

`[{ source, title, url, date }]` with:

- URLs canonicalized — `https`, no hash, no `utm_*` / `fbclid` / `gclid` / `ref` / `source`,
  no trailing slash;
- duplicates removed by canonical URL;
- XML entities decoded (`&amp;`, `&#8217;`, `&#x2019;`), CDATA unwrapped.

A dead feed is skipped with `[skip] <name>: <error>` on stderr; the remaining sources
still run, so one 404 does not cost you the whole batch.

## Adding a source

Append to the project's own `sources.json`. No code change, no reinstall.

## Tests

`npm test` in `D:\docs\GitHub\skills` (vitest, `test/feeds.test.mjs`).
