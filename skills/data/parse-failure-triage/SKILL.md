---
name: parse-failure-triage
description: "Reads batch.json from try-parse-url and classifies failed parses (js-interstitial, waf-403, paywall, empty, timeout, non-html), writing parse-gaps.json with the attempts each URL burned and a suggested fallback per URL. Closes the failed-candidate loop. Triggers: parse failure triage, triage parse failures, parse gaps, failed parses."
---

# Parse failure triage

No candidate is dropped silently. `batch.mjs` records every failure plus the
`attempts` trail in `batch.json`; this skill classifies them and proposes the
next fallback.

## Run

```bash
node scripts/triage.mjs --batch docs/research/generated/<run>/batch.json [--out parse-gaps.json]
```

## Output (parse-gaps.json)

```json
{
  "generatedAt": "...",
  "total": 0,
  "failed": 0,
  "byReason": { "js-interstitial": 0, "waf-403": 0 },
  "attemptedByReason": {
    "waf-403": { "ua-retry": { "tried": 3, "ok": 0, "failed": 3 } }
  },
  "gaps": [
    {
      "url": "...",
      "reason": "waf-403",
      "suggestedFallback": "ua-retry",
      "attemptedMethods": ["http-precheck", "ua-retry"],
      "attempts": [
        { "method": "http-precheck", "ok": false, "error": "HTTP 403" },
        { "method": "ua-retry", "ok": false, "error": "HTTP 403 (UA: Googlebot)" }
      ],
      "error": "..."
    }
  ]
}
```

`attempts` is copied from the batch unchanged, `attemptedMethods` is its unique
method list, and `attemptedByReason` aggregates the counters per failure reason.
`parse-gap-review` uses them to show what the chain already tried.

Suggested fallbacks: `decode-redirect`, `ua-retry`, `archive-org`, `google-cache`,
`pdf-extractor`, `retry-later`, `manual`.