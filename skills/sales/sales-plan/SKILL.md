---
name: sales-plan
description: "Turns audit gaps and tagged models into a deterministic queue: gap-closing first, then a premium fill for tags that already have a product. Integer scoring (tag match, trusted brand, price percentile, image, spec), tie-break by sku. Triggers: shop plan, что добавить в каталог, кандидаты товаров, очередь товаров, premium подбор."
---

# shop-plan

One job: choose the few products worth adding, and say why.

Relevance first. A candidate enters only if it carries a canonical tag the blog
uses. Brand is the second signal (internal trust), premium is the third — the
user sees none of it, they see a product that matches the article.

## Commands

```bash
node scripts/plan.mjs --audit data/<host>/audit.json \
  --tagged data/<host>/tagged-index.json \
  --sellers data/<host>/sellers.yaml \
  [--limit 3] [--premium-per-tag 1] [--out data/<host>/plan.json]
```

Exit `0` — queue written, `1` — nothing to add, `2` — error.

## Scoring

| Signal | Points |
|---|---|
| Each matched canonical tag (max 2) | 3 |
| Brand in `sellers.yaml` | 2 |
| Premium: price in the brand's top quartile | 2 |
| Premium: above the brand's median | 1 |
| Has an image | 1 |
| Has a description or category | 1 |

`flagship` from the allowlist stands in for the price percentile when a brand
publishes no number. Ties break by `sku` ascending, so the queue is stable.

Two more inputs shape the plan:

- **updates** — a catalog entry with no image, no description, or an English
  short description is not a new candidate: the index can enrich it, and the
  update goes through the same gate. Matching is by sku, then by name.
- **skipped** — accessories and pages without a robot type are reported by
  `shop-tagmap` and never reach the queue.

## Output

`data/<host>/plan.json`: `queue[]` with `reason: "gap" | "premium"`, `tag`,
`articles`, ranked `candidates[]`, plus `candidates[]` (deduped skus) and `stats`.

## Contract

- Input: audit, tagged index, allowlist. No network.
- Output: one JSON file; every candidate already exists somewhere on the web —
  the node never invents a model.
- Exit `1` is a result: the shop is covered, nothing to add.

## Validation

`node --check scripts/plan.mjs`; `test/shop-lib.test.mjs` covers ranking,
premium queues and dedupe.
