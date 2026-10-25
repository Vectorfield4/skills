---
name: try-parse-url
description: "Fallback parser inside the news-article chain news-fetcher -> published-check -> article-extractor -> translate-article -> wp-publish: use it only when article-extractor answers with an error or a truncated body. Parses one article URL with a fallback chain (Readability first, then raw fetch + checks) and returns a standardized result with a per-attempt trail. Triggers: try parse url, try parse, parse url with fallback, parse failed, article-extractor failed, попробовать распарсить, парсинг не удался."
---

# Try parse url

Parse one article URL into a standardized body. Tries the cheapest reliable
method first and records why it failed, so callers can decide on a fallback
(Google cache, RSS source URL, manual extraction) instead of guessing.

## Input

- Positional `<url>` (required) or `--url <url>`.
- `--out <file>` (optional): write the standardized JSON to a file.
- `--slug <slug>` (optional): with `--out` omitted, writes to
  `docs/research/<slug>.parsed.json`.
- `--min-words <n>` (optional, default 80): minimum `textContent` word count to
  accept a Readability result.

## Output (JSON)

```json
{
  "url": "https://...",
  "status": "ok | failed",
  "method": "readability | fetch-check | none",
  "title": "...",
  "byline": "...",
  "excerpt": "...",
  "textContent": "...",
  "wordCount": 0,
  "siteName": "...",
  "httpStatus": 200,
  "contentType": "text/html; charset=utf-8",
  "error": null,
  "fallback": "none | webfetch | google-cache | rss-source | manual",
  "attempts": [
    { "method": "http-precheck", "ok": true, "error": null },
    { "method": "readability", "ok": false, "error": "Readability body too short (12 words < 80)" }
  ]
}
```

`attempts` is the audit trail: one entry per method the parser actually ran,
in order, with `ok` and the failure reason. It is never trimmed to the winning
method, so `parse-failure-triage` can tell which methods are already exhausted.

## Process (fallback chain)

1. **HTTP pre-check.** Fetch the URL with a browser UA. Record `httpStatus`,
   `contentType`, body size, and the `http-precheck` attempt. If status != 200
   or content-type is not HTML/text → `status: failed`, set `fallback`
   accordingly (403 → maybe webfetch with alternate UA; 404 → none; 429 →
   retry-later).
2. **Readability.** Run `article-extractor`'s `extract`. If it returns an article
   with `textContent` of at least `--min-words` words → `status: ok`,
   `method: readability`, `attempts` holds a successful `readability` entry.
3. **Short/empty body.** If Readability returns null or < `--min-words` words →
   treat as `status: failed`, `method: readability`, `fallback: webfetch`. The
   failed `readability` attempt records the word count.
4. **JS interstitial / paywall.** If the body contains interstitial markers
   (e.g. `data-n-a-sg`, `batchexecute`, "enable JavaScript") or is < 40 words
   after a 200 OK → `fallback: google-cache` or `rss-source`: the caller should
   look up the article in Google cache or use the RSS source URL.
5. **Never invent content.** If all methods fail, return `status: failed` with
   the recorded reason; do not fabricate text.

## Constraints

- One URL per invocation. For batches, use `scripts/batch.mjs` (see below).
- No file writes unless `--out`/`--slug` is given.
- No translation, no drafting, no source-spec authoring.
- Does not bypass paywalls or captchas; records them as failures.

## Batch

Parse many URLs through the full fallback chain and write one file per URL plus a
summary:

```bash
node skills/data/try-parse-url/scripts/batch.mjs \
  --file candidates.json [--out-dir docs/research/generated] [--min-words 80]
node skills/data/try-parse-url/scripts/batch.mjs \
  --urls urls.txt [--out-dir docs/research/generated]
```

- `--file <candidates.json>`: JSON array of URLs or `{ url }`/`{ candidates }`
  objects (as produced by `news-fetcher`).
- `--urls <file.txt>`: one URL per line (`#` comments allowed).
- Writes `<slug>.parsed.json` per URL and `batch.json` summary in `--out-dir`
  (default `docs/research/generated`).
- `batch.json` carries `attempts` for every result, `attemptedMethods` per URL
  (the method names tried), and a top-level `attemptsByMethod` map
  (`{ tried, ok, failed, errors }`) that says what the chain already burned.
- Concurrency via `--concurrency N` (default 1).

## Validation

- Run `npm test`.
