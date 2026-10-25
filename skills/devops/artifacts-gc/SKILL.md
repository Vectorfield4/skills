---
name: artifacts-gc
description: "Removes generated task reports in artifacts/ older than N days. Closes the execute-* -> consumer loop. Triggers: artifacts gc, clean artifacts, remove old reports, очистить артефакты."
---

# Artifacts GC

Delete generated task reports older than N days.

## Run

```bash
node scripts/gc.mjs --dir artifacts --days 30 [--dry-run]
```