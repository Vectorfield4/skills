---
name: sales-audit
description: "Builds the shop audit in one pass: the tag matrix of the blog and every product including drafts, plus the list of tags no product carries. The gap list is what drives the whole shop pipeline. Triggers: shop audit, теги без товаров, покрытие тегов, gaps, аудит каталога, какие теги без товара."
---

# shop-audit

One job: name the tags the blog uses and the products that exist, so the next
node knows exactly which tags have nothing to show.

Drafts are the trick. The public Store API hides them, so a `draft`-only shop
looks empty; this node reads WC REST with `status=any` when keys exist, and falls
back to the local catalog otherwise.

## Commands

```bash
# live: WP posts + tags, WC REST (drafts included)
node scripts/audit.mjs [--host hello-robot.ru]

# offline: local article pairs, no network at all
node scripts/audit.mjs --offline --articles articles
```

Flags: `--catalog products/catalog.json`, `--aliases data/<host>/tag-aliases.json`,
`--out data/<host>/audit.json`.

## Output

`data/<host>/audit.json`:

```json
{
  "articles": 23,
  "tags": [{ "tag": "гуманоиды", "canon": "гуманоиды", "articles": 5, "covered": true }],
  "gaps": ["коботы"],
  "known_tag_canons": ["гуманоиды", "коботы"],
  "product_tag_canons": ["гуманоиды"],
  "products": [{ "sku": "HR-UNITREE-G1", "name": "Unitree G1", "status": "draft" }]
}
```

Rows are sorted by article count, then canonically, so the file is stable.

## Contract

- Input: WP REST (public) and WC REST (when keys exist) or local article files.
- Output: one JSON file, sorted; exit `0` always on a written audit, `2` on error.
- The node never decides what to add. It only reports coverage.

## Validation

`node --check scripts/audit.mjs`; `npm test` in the skills repo.
