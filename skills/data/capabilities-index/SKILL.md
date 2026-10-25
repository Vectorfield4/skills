---
name: capabilities-index
description: "Scans docs/capabilities/ and docs/capabilities/sources/ and writes an index JSON listing all specs with paths and titles. Closes the source-explorer/spec-interviewer -> consumer loop. Triggers: capabilities index, index capabilities, capabilities scan."
---

# Capabilities index

Scan capability specs and source specs, write a machine-readable index.

## Run

```bash
node scripts/index.mjs --root docs/capabilities [--out docs/capabilities/index.json]
```

- `--root` (default `docs/capabilities`).
- `--out` (default `<root>/index.json`).