---
name: shop-catalog
description: "Merges gate verdicts into products/catalog.json: sorted by sku, price-free, idempotent. The catalog is the tracked source of truth for what the shop sells; a second run on the same input changes no byte. Triggers: shop catalog, обновить каталог, merge каталога, catalog.json, товары в репозитории."
---

# shop-catalog

One job: keep `products/catalog.json` a clean, price-free, deterministic file.

The catalog is tracked: it says what we sell, with which tags and which image.
Prices are not part of it — they live in `data/<host>/prices.yaml`.

## Commands

```bash
node scripts/merge.mjs --catalog products/catalog.json \
  --gated data/<host>/gated.json [--out products/catalog.json]

node scripts/merge.mjs --catalog products/catalog.json --gated data/<host>/gated.json --check
```

`--check` writes nothing and exits `1` when the merge would change the file — the
cheap way to prove the second run is a no-op.

Exit `0` — written (or no changes), `1` — `--check` found changes, `2` — error.

## Entry shape

```json
{
  "sku": "HR-UNITREE-G1",
  "name": "Unitree G1",
  "slug": "unitree-g1",
  "type": "simple",
  "status": "publish",
  "stock_status": "onbackorder",
  "short_description": "Человекоподобный робот для лабораторий.",
  "description": "…",
  "categories": ["Гуманоиды"],
  "tags": ["гуманоиды", "роботы"],
  "images": [{ "src": "https://…/g1.jpg" }],
  "source_url": "https://unitree.com/g1",
  "review_note": ""
}
```

`status` is the gate verdict. `review_note` carries the failed verdict reasons,
so a draft explains itself without a price excuse.

## Contract

- Unknown keys are dropped; price fields are dropped even from an old catalog.
- Output is sorted by sku, tags deduplicated.
- `shop-catalog-merge` never decides publish; it records `shop-gate`'s verdict.

## Validation

`node --check scripts/merge.mjs`; `test/shop-lib.test.mjs` covers idempotence,
price stripping and the draft note.
