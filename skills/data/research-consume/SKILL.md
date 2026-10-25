---
name: research-consume
description: "Reads a research pack (article-research output) and prints a machine-readable handoff for write-article: slug, pack path, genre candidate, primary source URL. Closes the article-research -> write-article loop. Triggers: research consume, consume research pack, read research pack, research handoff."
---

# Research consume

Read a research pack produced by `article-research` and emit a handoff that
`write-article` can consume without manual copy-paste. Ensures the pack is not an
orphan artifact.

## Run

```bash
node scripts/consume.mjs --pack docs/research/generated/<run>.pack.json [--out handoff.json]
```

- `--pack` (required): path to the research pack JSON.
- `--out` (optional): write the handoff JSON to a file; otherwise stdout.

## Output (handoff JSON)

```json
{
  "slug": "...",
  "packPath": "docs/research/generated/<run>.pack.json",
  "genreCandidate": "media | industry | research",
  "primarySourceUrl": "https://...",
  "selectedCount": 0,
  "candidates": [ { "title": "...", "url": "...", "lang": "..." } ]
}
```

## Rules

- Read only. Never modify the pack.
- If the pack has no `selected` candidates, exit non-zero and report.
- `_source_url` in the downstream article must point to `primarySourceUrl`.