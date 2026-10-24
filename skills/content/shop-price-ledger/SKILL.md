---
name: shop-price-ledger
description: "Moves harvested prices into data/<host>/prices.yaml — the only place a price exists. Local, gitignored, for the phone call; never sent to WooCommerce and never rendered. Triggers: прайс лист, цены товаров локально, price ledger, куда складывать цены, цены не в wordpress."
---

# shop-price-ledger

One job: keep collected prices in a local ledger and out of the shop.

The site shows the robot, not a number. A price is given personally on the
phone, so it belongs to `data/<host>/prices.yaml` (gitignored) and nowhere else:
not in `products/catalog.json`, not in a WooCommerce payload, not in JSON-LD.

## Commands

```bash
node scripts/ledger.mjs record [--index data/<host>/index] [--file data/<host>/prices.yaml]
node scripts/ledger.mjs list   [--with-price]
```

`record` builds a snapshot of the current index: one row per sku, an empty price
is stored as empty (the brand publishes no number) rather than guessed. A
renamed sku cannot leave two rows behind.

## Output

```yaml
host: hello-robot.ru
updated_at: "2026-10-24T09:12:00Z"
items:
  - brand: Unitree
    captured_at: "2026-10-24T09:12:00Z"
    currency: EUR
    model: Unitree G1
    price: "19999.00"
    sku: HR-UNITREE-G1
    source_url: https://unitree.com/g1
```

Exit `0` — ledger written / rows listed, `1` — nothing recorded, `2` — error.

## Contract

- Input: `data/<host>/index/*.json`.
- Output: one YAML file in the narrow schema, sorted by sku.
- Never: write a price into the catalog, a payload or an article.

## Validation

`node --check scripts/ledger.mjs`; `test/shop-lib.test.mjs` covers upsert and
empty-price handling.
