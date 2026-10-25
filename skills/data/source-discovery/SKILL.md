---
name: source-discovery
description: "Mechanical discovery only: websearch + fetch + candidate selection. Returns a structured candidate list. No article bodies, no translation, no file writes, no storage."
---

# Source discovery

Discovery only. Returns a structured list of candidate URLs for a company or a
topic/country. Does not extract article bodies, does not translate, does not
write files, does not touch storage.

## Input

JSON passed to the subagent:

```json
{
  "anchor": "company | topic-country",
  "company": { "name": "...", "ticker": "...", "legal_name": "...", "country": "..." },
  "topic": "...",
  "country": "...",
  "lang": "any",
  "kinds": ["news", "disclosure", "procurement", "patent", "court", "registry", "media"],
  "limit": 5,
  "exclude_urls": [],
  "context": "..."
}
```

Fields:

- `anchor` - one of `company` or `topic-country`.
- `company` - present when `anchor=company`. `name` required; `ticker`, `legal_name`, `country` optional.
- `topic` - free-text topic (used when `anchor=topic-country` and as an extra hint otherwise).
- `country` - target country.
- `lang` - target language code or `any` (default `any`).
- `kinds` - subset of `news`, `disclosure`, `procurement`, `patent`, `court`, `registry`, `media`.
- `limit` - max candidates to return (default 5).
- `exclude_urls` - URLs to skip.
- `context` - free-form extra context.

## Output

```json
{
  "queries": ["..."],
  "candidates": [
    {
      "url": "https://...",
      "title": "original title, untranslated",
      "snippet": "...",
      "lang": "ru",
      "country": "RU",
      "kind": "disclosure",
      "source_type": "site",
      "reason": "...",
      "confidence": "high"
    }
  ],
  "rejected": [{ "url": "https://...", "reason": "..." }],
  "notes": "..."
}
```

- `queries` - every query actually run, including the target-language ones.
- `candidates[].url` - canonical URL (https, no hash, no tracking params, no trailing slash).
- `title` - original title, never translated.
- `snippet` - short excerpt from search result or fetched page.
- `source_type` - one of `site`, `feed`, `registry`, `database`.
- `confidence` - `high`, `medium`, or `low`.

## Behavior

1. Build 2-4 query variants:
   - English base query.
   - Target-language query when `lang` is not `any`.
   - `site:`-hinted queries for likely official domains (company IR, regulator, court, procurement portal).
2. Run `websearch` for each query.
3. Fetch the top results with `webfetch` to drop dead links and captcha pages.
4. Canonicalize URLs; deduplicate by canonical URL.
5. Skip anything in `exclude_urls`.
6. Prioritize official domains (company site, regulator, court, registry, procurement portal) over aggregators.
7. Classify each surviving result by `kind`, `source_type`, `lang`, `country`.
8. Assign `confidence` based on domain authority and match to the request.
9. Return at most `limit` candidates; put dropped results in `rejected` when useful.

## Tools

- `websearch`
- `webfetch`

No `edit`, `bash`, or `task`. No file writes.

## Constraints

- Discovery and candidate selection only.
- Do not extract article bodies.
- Do not translate titles or snippets beyond preserving the original.
- Do not write to storage or any file.
- Do not reference orchestrators or other skills.
- Do not invent URLs; every candidate must come from a real search/fetch.
