---
name: candidates-triage
description: "Reads a candidates JSON (news-fetcher/thematic-article-search output), deduplicates by canonical URL, filters by topic/lang/country, and prints a shortlist for article-research. Closes the discovery -> research loop. Triggers: candidates triage, triage candidates, filter candidates, shortlist candidates."
---

# Candidates triage

Read a candidates file, deduplicate, filter, and print a shortlist that
`article-research` can consume. Ensures candidates files are not orphan artifacts.

## Run

```bash
node scripts/triage.mjs --file docs/research/candidates.json [--topic robotics] [--lang en] [--country US] [--limit 20] [--out shortlist.json]
```

## Output

JSON array of candidates: `[{ source, title, url, date, lang, country, weight, score }]`.