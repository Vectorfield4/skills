---
name: news-fetcher
description: "Step 1 (discovery) of the news-article chain news-fetcher -> published-check -> article-extractor -> translate-article -> wp-publish, which is the pipeline for a plain news site that keeps one articles/<slug>.<lang>.md per locale it ships (no content/plan, no generation queue, no cover gate). Collects news candidate links from RSS/Atom feeds and Hacker News without API keys. Takes a source list you provide (usually the project's scripts/sources.json) and returns deduplicated JSON (source, title, url, date). Triggers: news fetcher, add more articles, add new articles, new articles came out, find fresh news, latest news on a topic, candidates from feeds, собрать кандидатов, добавить статьи, свежие новости, что нового."
---

# News Fetcher

Discovery step of the article pipeline. Turns a list of feeds into one deduplicated
JSON array of candidate links. Plain `fetch`, no API keys, no dependencies.

Article bodies are a separate skill: `article-extractor`. End-to-end runs are
owned by the `content-translate-related-articles` agent; run this skill alone only when the
caller wants discovery and nothing else.

## Sources are data, not code

The fetcher ships **no** built-in sources — a hardcoded feed list is exactly what
makes a "universal" fetcher useless in the next project. Each project keeps its own
JSON:

```json
[
  { "name": "arXiv cs.RO", "url": "http://rss.arxiv.org/rss/cs.RO", "type": "rss" },
  { "name": "Hacker News", "url": "https://hn.algolia.com/api/v1/search?query=robotics&tags=story&hitsPerPage=20", "type": "hn" },
  {
    "name": "Figure",
    "url": "https://www.figure.ai/news",
    "type": "html-list",
    "selector": "a[href*=\"/news/\"]",
    "baseUrl": "https://www.figure.ai/news"
  },
  {
    "name": "KUKA press",
    "url": "https://www.kuka.com/en-us/api/news/GetPublications",
    "type": "json-list",
    "method": "POST",
    "body": "contextid=8EB48479F62C4292AC0D890B766155AD&offset=0&count=500",
    "itemsPath": "items",
    "titleField": "headline",
    "urlField": "href",
    "dateField": "dateISO"
  }
]
```

Sources may also carry optional `lang`, `country`, `weight` fields, which are copied onto each candidate.

`type` is one of:

| type | expected body |
|---|---|
| `rss` | RSS 2.0 XML |
| `atom` | Atom XML |
| `hn` | Hacker News Algolia search JSON (`hits[]`) |
| `html-list` | a server-rendered newsroom index page (no feed) |
| `json-list` | a newsroom JSON endpoint that returns the article list |

Both a bare array and `{ "sources": [...] }` are accepted. `type` defaults to `rss`.

## Companies without a feed (`html-list`)

Some newsrooms publish no RSS at all. Point `html-list` at the index page and give
it a link selector:

| field | meaning |
|---|---|
| `url` | newsroom index page; must be absolute |
| `selector` | optional CSS-like selector for article links, e.g. `a[href*="/news/"]`, `.news-list a`, `.news-list > a.card` |
| `baseUrl` | optional path prefix every candidate must stay under; defaults to the page origin |

Supported selector syntax: comma-separated groups, descendant (space) and child (`>`)
combinators, `tag`, `.class`, `#id`, `*`, and attribute tests `[attr]`, `[attr=v]`,
`[attr*=v]`, `[attr^=v]`, `[attr$=v]`, `[attr~=v]`, `[attr|=v]`. Sibling combinators
are treated as descendants.

The parser reads `<a href>` links, resolves relative URLs against the page (or its
`<base href>`), drops `#`/`mailto:`/`javascript:` links and the page itself, canonizes
and de-duplicates by URL. The title comes from a heading inside the link, else the link
text, else `aria-label`/`title`/`img alt`; when the same article is linked several times
(image, headline, "read more") the most informative label wins. The date comes from a
`<time datetime>` inside the link or a `data-date` attribute. Without a `selector`, only
internal links with an article-shaped path are kept — a best-effort fallback, a selector
is always more precise.

Client-rendered newsrooms (verified on ABB and KUKA today) return an empty shell to
`fetch` and yield zero links; they need a JSON API or a browser. Check a new source by
fetching it once before adding it.

## Newsrooms with a JSON API (`json-list`)

The same client-rendered newsroom usually serves its list from a JSON endpoint.
Point `json-list` at that endpoint instead of scraping the shell:

| field | meaning |
|---|---|
| `url` | JSON endpoint; must be absolute |
| `method` | optional `GET` (default) or `POST` |
| `body` | optional form-encoded body for `POST`; a JSON object is serialized as `k=v&k2=v2` |
| `itemsPath` | optional dotted path to the article array (`data.items`); without it the root array or a top-level `items`/`data`/`results` array is used |
| `urlField` / `titleField` / `dateField` | optional dotted key names when an item does not use `url` / `title` / `date` |
| `urlTemplate` | optional URL built from item fields, `{field}` / `{nested.field}` placeholders (used when the payload carries only an id and a slug) |
| `baseUrl` | optional prefix for relative links; defaults to the endpoint origin |

Find the endpoint in DevTools → Network → Fetch/XHR on the news index: take the
request whose response carries the article list. Relative `href`s resolve against
`baseUrl` (or the endpoint), absolute ones are kept. Items go through the same
URL canonicalization and de-duplication as every other source, so an article that
also arrives from the feed collapses to one candidate.

Two shapes that recur:

- **Form-encoded POST with a session id.** KUKA's list endpoint needs a
  `contextid` copied from the news page's filter form; ask for the whole list in
  one call (`offset=0&count=500`) instead of paginating.
- **Market-scoped path.** When the payload's `href`s point at the wrong market
  (KUKA returned `nl-be` from `/api/...`), the same API under the market prefix
  (`/en-us/api/...`) returns that market's links.
- **Template URLs.** ABB's newsbank returns `{ id, newsUrlTitleSlug }` only, so
  `urlTemplate: "/global/en/news/{id}/{newsUrlTitleSlug}"` plus
  `baseUrl: "https://www.abb.com"` rebuilds the article URL.

`json-list` reads one page; a paginated API (`?page=2`) is out of scope: pick the
endpoint and page size that already return the recent window (ABB: `pageSize` up
to 100, 30 is about a year).

Some endpoints reject a non-browser user agent, so `json-list` fetches with
`BROWSER_UA` like `html-list` does. A response with no article array is a config
error: the source is skipped with `[skip] <name>: ... itemsPath ...`.

## Run

From the project root:

```bash
node ~/.config/opencode/skills/data/news-fetcher/scripts/fetch-candidates.mjs \
  --sources scripts/sources.json --out candidates.json
```

- `--sources <file.json>` — required.
- `--topic <topic>` — optional; filter candidates by topic keywords.
- `--lang <lang>` — optional; filter by candidate `lang`.
- `--country <country>` — optional; filter by candidate `country`.
- `--out <file.json>` — optional; without it the JSON goes to stdout.

## Output

`[{ source, title, url, date, lang, country, weight }]` with:

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
