---
name: cleanup-research
description: "Removes generated research artifacts older than N days from docs/research/generated/. Triggers: cleanup research, clean research, research clean, очистить research, удалить старые артефакты."
---

# Cleanup research

Removes stale generated research artifacts (parsed JSON, packs, batch summaries)
from `docs/research/generated/`.

## Run

```bash
node skills/data/cleanup-research/scripts/clean.mjs [--dir <dir>] [--days <n>] [--dry-run]
```

Or via npm (in the skills repo):

```bash
npm run research:clean
npm run research:clean -- --days 14 --dry-run
```

## Input

- `--dir <dir>` (optional): directory to clean. Default `docs/research/generated`.
- `--days <n>` (optional, default 7): delete files older than N days (by mtime).
- `--dry-run` (optional): list files that would be deleted without deleting.
- `--no-recursive` (optional): do not recurse into subdirectories.

## Behavior

- Walks the target directory recursively.
- Deletes regular files whose mtime is older than `--days`.
- Never deletes directories themselves (only files).
- Prints a summary and the list of removed files.

## Constraints

- Only touches files under the given directory.
- Does not delete anything when `--dry-run` is set.
- No LLM steps.

## Validation

- Run `npm test`.
