---
name: shop-verify
description: "Checks the result instead of trusting it: is the product visible on the Store API (drafts are not) and did its tags survive, then re-runs the tag matrix to show gaps closed and gaps left. Triggers: shop verify, проверить публикацию товара, товар виден на сайте, закрылись ли теги, проверка витрины."
---

# shop-verify

One job: prove the product is really on the site, under the right tag.

Publishing and being visible are different facts. Only a `publish` product
reaches the Store API, and a product without tags never appears under an
article. Both are checked here.

## Commands

```bash
node scripts/verify.mjs store    --gated data/<host>/gated.json
node scripts/verify.mjs coverage --audit data/<host>/audit.json
```

Exit `0` — verified, `1` — gaps remain, `2` — error.

## Output

- `data/<host>/verify-store.json` — per sku: `visible`, `id`, `tags`,
  `missingTags`, `images`, `ok`, `problems`.
- `data/<host>/verify-coverage.json` — `before`, `covered_now`, `still_open`,
  `store_products`.

## Contract

- Reads the public Store API only: if a product is missing there, it is a draft.
- Uses the same alias map as the frontend, so "Humanoid" counts as "гуманоиды".
- Never fixes anything; it reports.

## Validation

`node --check scripts/verify.mjs`; `test/shop-lib.test.mjs` covers the draft and
missing-tag cases.
