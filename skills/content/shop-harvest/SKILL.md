---
name: shop-harvest
description: "Harvests product facts from brand sites through their sitemap and schema.org JSON-LD: name, sku, price, image, category, availability. Writes data/<host>/index/<domain>.json with a TTL. Prices stay here and never reach WooCommerce. Triggers: shop harvest, собрать товары с сайтов брендов, sitemap товары, JSON-LD product, индекс моделей, спарсить каталог бренда."
---

# shop-harvest

One job: turn a brand's public catalogue into facts we can gate and rank.

No judgement happens here. The node does not decide tags (that is `shop-tagmap`),
trust (`shop-gate`) or price use (that is `shop-price-ledger`). It reads a
sitemap, opens product pages, and keeps the schema.org `Product` node.

## Commands

```bash
node scripts/harvest.mjs --domain unitree.com --max-urls 40
node scripts/harvest.mjs --sellers data/<host>/sellers.yaml --max-brands 4 --ttl-days 7
```

- `--domain` always refetches one brand.
- `--sellers` walks the allowlist, skips an index younger than `--ttl-days`,
  and fetches at most `--max-brands` per run — that is the fan-out width.
- `--delay-ms` is politeness between pages, default `0`.

Exit `0` — index written or still fresh, `1` — nothing found, `2` — bad flags.

## What counts as a product

- **JSON-LD** `Product` with a commerce signal: a price, an availability, a sku
  or a category.
- **OpenGraph** only when `og:type=product` **and** `product:price:amount` or
  `product:availability` is present. A marketing page with a pretty picture is
  not a product.
- The name must be a name: not a URL, 2–90 characters, at least two letters, and
  not a page title like «Store». No image, no product.

Accessories (battery, motor, lidar, module, kit, software) are harvested but
`shop-tagmap` skips them: a price list is not a catalogue.

## Output

`data/<host>/index/<domain>.json`:

```json
{
  "domain": "unitree.com",
  "sitemap": "https://unitree.com/sitemap.xml",
  "fetched_at": "2026-10-24T09:12:00Z",
  "products": [
    {
      "sku": "HR-UNITREE-G1",
      "name": "Unitree G1",
      "brand": "Unitree",
      "url": "https://unitree.com/g1",
      "price": "19999.00",
      "currency": "EUR",
      "image": "https://…/g1.jpg",
      "category": "Humanoid robots",
      "description": "…",
      "availability": "InStock"
    }
  ],
  "warnings": []
}
```

`sku` is the page's own sku when present, otherwise `HR-<BRAND>-<MODEL>`;
generation is deterministic, so a re-harvest produces the same sku.

## Price rule

A price may exist in this file. It is a fact for `shop-price-ledger` and the
phone call. `lib/shop/payload.mjs` has no price input, so no write node can leak
it into WooCommerce or the site.

## Validation

`node --check scripts/harvest.mjs`; `test/shop-lib.test.mjs` covers JSON-LD
extraction, sitemap parsing and sku generation.
