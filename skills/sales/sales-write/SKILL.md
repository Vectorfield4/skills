---
name: sales-write
description: "Adds approved products to WooCommerce by one of two transports: WC REST batch (tags, categories and images in one call) or the WordPress skill through MCP (create + terms + image + publish, because product-create has no tags/images fields). Picks the transport once, never sends a price. Triggers: shop write, залить товары в wordpress, опубликовать товар, добавить товар в woocommerce, shop import."
---

# shop-write

One job: put an approved catalog entry into the shop, with tags that make it
appear under the right article.

Two transports, chosen once by `capabilities.mjs` and recorded in
`data/<host>/transport.json`:

| Transport | When | Cost |
|---|---|---|
| `rest` | WC REST keys answer | 1 batch request for the whole run |
| `wp` | no keys, session has the WordPress MCP | 5 calls per product |

## Commands

```bash
# 1. decide the transport (--wp-skill = the session has the WordPress MCP)
node scripts/capabilities.mjs --wp-skill

# 2a. WC REST
node scripts/write-rest.mjs --catalog products/catalog.json --gated data/<host>/gated.json \
  [--only HR-UNITREE-G1] [--dry-run]

# 2b. WordPress skill: build the exact MCP arguments, then execute them in order
node scripts/write-wp-payload.mjs --catalog products/catalog.json --gated data/<host>/gated.json
```

Exit `0` — saved / plan written, `1` — some products failed / nothing to write,
`2` — no transport or a payload error.

## WordPress skill order (per product)

1. `woocommerce/product-create` with `product_type_alias: physical` → id
2. `ewpa/assign-cpt-terms` — `product_tag`, the article tags
3. `ewpa/assign-cpt-terms` — `product_cat`, the categories
4. `ewpa/upload-image` — `url`, `post_id` = id (product image)
5. `woocommerce/product-update` — `status` from the gate verdict

`product-create` has no `tags`, `categories` or `images` fields: skipping 2–4
produces a product no article can show.

## Price rule

`lib/sales/payload.mjs` has no price input. `regular_price` is the constant `"0"`,
which keeps `is_purchasable = true` so the "Заказать" form works. The real price
stays in `data/<host>/prices.yaml` and is given on the phone.

## Translation gate

The site is Russian-only, so a product card with an untranslated English or
Chinese paragraph must not reach WooCommerce. Both transports run
`scripts/check-translation.mjs` before writing (`--skip-translation` disables
it, not recommended). The gate is semantic (Jev, `typesafe:jev@1`) with a
deterministic fallback: a long Latin-only paragraph with no Cyrillic blocks the
write even without `RUNWARE_API_KEY`. A `fail` stops the run; gray-zone hits are
printed as warnings. Exit codes: `0` clean, `1` untranslated text found,
`2` workflow error.

## Contract

- Writes only products present in `gated.json`; a catalog entry without a gate
  verdict is never sent.
- A live product is never demoted to draft.
- Output: WC ids in stdout; for the `wp` transport, `data/<host>/wp-plan.json`.

## Validation

`node --check scripts/capabilities.mjs`, `node --check scripts/write-rest.mjs`,
`node --check scripts/write-wp-payload.mjs`; `test/shop-lib.test.mjs` proves a
price cannot reach the payload.
