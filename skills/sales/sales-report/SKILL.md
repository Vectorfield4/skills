---
name: sales-report
description: "Reads a run manifest and prints what executed, what was reused, how many requests it took; compares two runs node by node and reports whether the catalog changed. This is how the second run proves it is cheaper. Triggers: shop report, отчёт прогона, метрики прогона, diff прогонов, что изменилось за прогон."
---

# shop-report

One job: make "the second run is cheaper" a measurable statement.

Every node records the hash of its inputs and the hash of its outputs in
`data/<host>/runs/<stamp>/manifest.json`. This node turns that into a table and,
with `--diff`, into a before/after.

## Commands

```bash
node scripts/manifest.mjs start --run data/<host>/runs/<stamp>
node scripts/manifest.mjs add   --run <dir> --node audit --status ok --ms 812 --requests 4
node scripts/manifest.mjs seen  --run <dir>

# honest numbers: wall time and request count come from the wrapper
node scripts/measure.mjs --run <dir> --node audit -- node …/shop-audit/scripts/audit.mjs

node scripts/report.mjs --run data/<host>/runs/<stamp> \
  [--diff data/<host>/runs/<previous>] [--catalog products/catalog.json]
```

`measure.mjs` counts the URLs an outbound node fetched (each one appends a line to
`SHOP_METRICS_FILE`), so the table is not self-reported. Node hashes ignore
volatile keys (`generated_at`, `fetched_at`, …), otherwise every run would look
different.

Exit `0` — report written and nothing changed, `1` — nodes changed since the
previous run (or a node failed), `2` — error.

## Output

`summary.json` next to the manifest:

```json
{
  "nodes": 13,
  "executed": 5,
  "reused": 8,
  "failed": 0,
  "requests": 12,
  "ms": 4300,
  "diff": { "changed": [], "same": ["audit", "plan"] },
  "catalog": { "file": "products/catalog.json", "hash": "…" }
}
```

## Reading the second run

A healthy incremental run: `executed` only covers nodes whose inputs changed,
`requests` drops, and `diff.changed` is empty — the catalog is byte-identical.

## Contract

- Input: one or two run directories, optionally the catalog.
- Output: stdout table + `summary.json`; no network.
- A missing manifest is an error, not an empty report.

## Validation

`node --check scripts/report.mjs`; `test/shop-lib.test.mjs` covers summarize,
diff and reuse.
