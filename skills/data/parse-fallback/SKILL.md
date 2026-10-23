---
name: parse-fallback
description: "Bypass common parse failures (Google News JS interstitial, 403 WAF, empty/short pages) by resolving a Google News article id to the publisher URL through the DotsSplashUi RPC, decoding the redirect param, and trying alternate UA, Google cache, archive.org, and RSS source URL. Returns the standardized parse JSON with an attempts trail. Triggers: parse fallback, fallback parse, resolve google news url, google news id, обойти провал парсинга, google news parse, 403 waf."
---

# Parse Fallback

Wraps `try-parse-url` with a fallback chain for the failure modes recorded in
`docs/research/parse-report.md`: Google News JS interstitials, 403 WAF blocks,
and empty/short pages.

## When to use

- `try-parse-url` returned `status: failed`.
- The URL is a `news.google.com/rss/articles/...` link (resolved to the
  publisher first, see below).
- A site blocks the default browser UA (HTTP 403) or only renders its body in a
  browser: the chain tries a UA swap, then the reader proxy.

## Run

```bash
node ~/.config/opencode/skills/data/parse-fallback/scripts/fallback.mjs \
  <url> [--original-source <url>] [--feed-url <url>] [--out file.json] [--slug slug] [--min-words N]

# resolve only, no body parse
node ~/.config/opencode/skills/data/parse-fallback/scripts/google-news.mjs <google-news-url> [--out file.json]

# one page through the reader proxy, without the rest of the chain
node ~/.config/opencode/skills/data/parse-fallback/scripts/reader-fetch.mjs <url> [--out file.json] [--min-words N] [--timeout-ms N]
```

Without `--out` the JSON goes to stdout.

## Input

- Positional `<url>` (required) or `--url <url>`.
- `--original-source <url>` / `--originalSourceUrl`: original article URL when
  the candidate came from a feed (RSS source URL).
- `--feed-url <url>` / `--feedUrl`: feed URL the candidate came from (optional
  context; not parsed directly).
- `--out <file>`, `--slug <slug>`, `--min-words <n>` (default 80).

## Google News resolution

A current `news.google.com/(rss/)articles/CBMi...` link is not a redirect: the
id is a protobuf envelope whose payload is an opaque `AU_yq...` token, so the
publisher URL is neither in the URL nor in the protobuf. The resolver
(`scripts/google-news.mjs`) does what the page's own JavaScript does:

1. `GET https://news.google.com/articles/<id>?oc=5` and read `data-n-a-id`,
   `data-n-a-ts`, `data-n-a-sg` (the `/rss/articles/` path is tried when the
   `/articles/` one is blocked).
2. `POST https://news.google.com/_/DotsSplashUi/data/batchexecute` with a
   `f.req` `Fbv4je` / `garturlreq` call carrying those tokens.
3. Read `["garturlres","<publisher url>",1]` out of the `wrb.fr` row.

The `ceid` (or `gl`+`hl`) parameter of the link sets the `garturlreq` locale
(default `US:en`).

No API key, no headless browser, no paywall bypass. `resolveGoogleNews(url)`
returns `{ url, id, originalUrl, method, error, attempts }`, where `method` is
`batchexecute` | `protobuf` (legacy ids that embed the URL) | `query-param`
(an explicit `url`/`q` parameter) | `null`.

## Output (JSON)

Same shape as `try-parse-url`, plus the resolution result when the input was a
Google News link:

```json
{
  "url": "https://...",
  "status": "ok | failed",
  "method": "google-news | ua-retry | reader-proxy | decode-redirect | google-cache | archive-org | rss-source | readability | none",
  "title": "...",
  "byline": "...",
  "excerpt": "...",
  "textContent": "...",
  "wordCount": 0,
  "siteName": "...",
  "httpStatus": 200,
  "contentType": "text/html; charset=utf-8",
  "error": null,
  "fallback": "none | manual",
  "resolvedUrl": "https://publisher.example/story",
  "resolvedBy": "batchexecute | protobuf | query-param",
  "attempts": [
    { "method": "google-news-protobuf", "ok": false, "error": "opaque id token (AU_yqLNTtnzF…): no publisher URL in the protobuf" },
    { "method": "google-news-page", "ok": true, "error": null },
    { "method": "google-news-batchexecute", "ok": true, "error": null },
    { "method": "http-precheck", "ok": true, "error": null },
    { "method": "readability", "ok": true, "error": null }
  ]
}
```

`resolvedUrl` / `resolvedBy` are `null` for non-Google News inputs.

`attempts` is appended across the whole chain: the resolution attempts first
(for Google News), then the base parse attempts, then every fallback method in
the order it ran. A successful run keeps the failed attempts before the winning
one.

## Reader proxy

`scripts/reader-fetch.mjs` reads one page through `https://r.jina.ai/`, which
renders it in a real browser and returns the article as markdown. It answers the
two cases a direct fetch cannot fix: a 403 WAF block that survives a UA swap,
and a body that only exists after JavaScript runs. Output is the parse JSON with
`method: "reader-proxy"`, plus `charCount`.

The chain calls it: `fallback()` runs the step after both UA attempts fail, for
every target that is not a Google News link. A success returns
`method: "reader-proxy"` with the step's `attempts` entry appended to the trail;
a failure appends `{ method: "reader-proxy", ok: false, error }` and the chain
continues. A refused proxy never ends the chain. `reader-fetch.mjs` stays usable
on its own for a single page:

```bash
node ~/.config/opencode/skills/data/parse-fallback/scripts/reader-fetch.mjs <url> [--out file.json] [--min-words N] [--timeout-ms N]
```

`readerFetch(url, { minWords, timeoutMs })` from `scripts/reader-fetch.mjs` is
the step as a function (this is what `fallback()` calls); `fetchViaReader(target,
{ timeoutMs })` from `#lib/reader.mjs` returns the raw proxy document when a
caller needs the warnings instead of the parse JSON.

Proxy constraints, measured on 2026-10-23:

- `status` is the proxy's HTTP status; the origin status is not exposed.
- Whole domains can be blocked for anonymous use: `news.google.com` answers HTTP
  403 `AbuseAlleviationError`. A Google News link still goes through the
  resolution step, never the reader.
- The proxy's Cloudflare shield rejects a desktop Chrome UA from a non-browser
  client (HTTP 403), so `lib/reader.mjs` sends
  `Mozilla/5.0 (compatible; opencode-skills/1.0)`. The browser UA is what the
  target site wants, not what the proxy accepts.
- Free tier: 20 requests per 60 s per IP. Pace batches and record HTTP 429.
- A markdown body carries nav and promo links, so a word count is a floor, not a
  quality check: a login wall can still clear it. Read the proxy's `Warning:`
  lines (`CAPTCHA`, `Enable JavaScript`, `not yet fully loaded`) before trusting
  the body, and keep captcha/paywall pages as failures.
- `READER_PROXY` overrides the endpoint for a self-hosted mirror; `userAgent`,
  `timeoutMs` and `minChars` are per-call options.

## Fallback chain

1. **Google News resolution.** For a `news.google.com/(rss/)articles/<id>` URL,
   resolve the publisher URL first (`resolveGoogleNews`), parse it, and return
   `method: google-news` with `resolvedUrl` / `resolvedBy` set. The base parse
   is skipped: the article page is a JS shell. If resolution fails, the
   attempts say why (blocked page paths, rejected signature) and the chain
   continues on the original URL. The reader proxy is skipped on this path.
2. **Base parse.** Run `try-parse-url` (`parse`). If `status: ok`, return as-is.
   Its `attempts` are carried into the result. Skipped for Google News links.
3. **ua-retry.** Refetch the target (the publisher URL once resolved) with
   mobile Chrome and Googlebot User-Agents and run Readability. One `ua-retry`
   attempt per UA, success -> `method: ua-retry` (`google-news` when the target
   came from a resolution).
4. **reader-proxy.** A real browser fetches the page the UA swap could not.
   Success -> `method: reader-proxy`; a refused or too-short body is one
   `reader-proxy` attempt and the chain moves on. Skipped for Google News links
   (the proxy domain is blocked for them).
5. **decode-redirect.** Read the `url`/`q` redirect parameter (or a supplied
   `originalSourceUrl` for a Google News link) and record whether a publisher
   URL was resolved. Success -> `method: decode-redirect` after that URL parses.
6. **rss-source.** Parse the supplied `originalSourceUrl` directly. Success ->
   `method: rss-source`.
7. **google-cache.** Try
   `webcache.googleusercontent.com/search?q=cache:<target>`. Success ->
   `method: google-cache`.
8. **archive.org.** Try `web.archive.org/web/*/<target>`. Success ->
   `method: archive-org`.
9. **Failure.** If everything fails, return `status: failed`, `method: none`,
   with the recorded reason in `error`, `fallback: manual`, and every attempt in
   `attempts`. No content is invented. Paywalls/captchas are recorded as
   failures, not bypassed.

## Constraints

- One URL per invocation.
- Never fabricates text; records failures.
- Does not bypass paywalls or captchas.
- The `DotsSplashUi` RPC is an undocumented Google endpoint: it can change
  without notice, and a flagged IP gets HTTP 429/503 on every
  `news.google.com` path. The resolver retries once per page path with the
  `Retry-After` delay and then records the block; it keeps no cookies and does
  not solve captchas.
- Pace Google News batches (`batch.mjs --delay 3000`). A burst of resolutions
  gets the whole IP flagged for tens of minutes; when the page attempt reports
  `HTTP 429`, stop and retry later instead of walking the remaining links.

## Validation

- Run `npm test` in `D:\docs\GitHub\skills`.
- Run `npm run doctor` in `D:\docs\GitHub\skills`.
