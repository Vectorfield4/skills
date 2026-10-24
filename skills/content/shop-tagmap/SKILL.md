---
name: shop-tagmap
description: "Maps harvested models to canonical blog tags by rules in products/tag-rules.yaml: a model rule wins, otherwise brand and type rules are unioned, then only tags the blog actually uses survive. Unmatched models are reported as unmapped, never tagged by guess. Triggers: tagmap, разметить товары тегами, правила тегов, маппинг моделей на теги, товар под статью."
---

# shop-tagmap

One job: attach the tag that makes a product appear under the article a reader
just read.

A tag is functional: it is the reason the product exists in the catalog. The
node therefore refuses to invent one. A model with no matching rule lands in
`unmapped` with its sku, so a human adds one line to the rules file.

## Commands

```bash
node scripts/tagmap.mjs --audit data/<host>/audit.json \
  --rules products/tag-rules.yaml \
  [--index data/<host>/index] [--aliases data/<host>/tag-aliases.json] \
  [--out data/<host>/tagged-index.json]
```

Exit `0` — at least one model mapped, `1` — none mapped, `2` — error.

## Rules

`products/tag-rules.yaml` is tracked: the mapping decides what enters the shop,
so it is project config, not run data.

```yaml
version: 1
rule:
  - kind: model
    match: unitree g1
    tags: "гуманоиды, роботы"
  - kind: brand
    match: Unitree
    tags: "роботы"
  - kind: type
    match: quadruped
    tags: "биоинспирированная робототехника, роботы"
```

- `kind: model` wins outright (matched against the normalized name and sku).
- Otherwise brand + type rules are unioned.
- Types come from `TYPE_KEYWORDS` in `lib/shop/tagmap.mjs` (humanoid, quadruped,
  cobot, manipulator, amr, exoskeleton, drone, soft).
- A model with no type and no `kind: model` rule is skipped as "not a robot":
  the brand rule alone also matches accessory pages.
- Every tag goes through the alias map and is dropped unless the blog uses it.

## Output

`data/<host>/tagged-index.json`: `products[]` with `tags`, `dropped`, `types`,
plus `unmapped[]` and `stats`.

## Validation

`node --check scripts/tagmap.mjs`; `test/shop-lib.test.mjs` covers model override,
union, dropped tags and unmapped reporting.
