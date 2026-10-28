---
name: sales-gate
description: "Three independent verdicts per candidate: trusted brand, unique product on the site (drafts included), and enough spec to render a page. publish only when all three pass; price never blocks. Triggers: shop gate, публиковать или draft, уникальность товара, проверка бренда, гейт каталога."
---

# shop-gate

One job: decide `publish` or `draft` from facts, not from mood.

| Verdict | Question | Fails when |
|---|---|---|
| trust | Is the brand in `sellers.yaml`? | brand/domain unknown to us |
| unique | Does the site already carry it? | same sku or same normalized name (siblings like B2 / B2-W are different robots) |
| spec | Is there something to show? | no image, and no category and no description ≥ 80 chars |

Price is absent on purpose: it is never published, so it cannot block.

## Commands

```bash
node scripts/gate.mjs all --plan data/<host>/plan.json --audit data/<host>/audit.json \
  --sellers data/<host>/sellers.yaml [--out data/<host>/gated.json]

node scripts/gate.mjs trust  --product docs/research/candidate.json
node scripts/gate.mjs unique --product docs/research/candidate.json
node scripts/gate.mjs spec   --product docs/research/candidate.json
```

Exit `0` — gate written / verdict ok, `1` — verdict failed, `2` — error.

## Output

`data/<host>/gated.json`: `items[]` with `verdict`, `reasons[]`, `trust`,
`unique`, `spec`, and the facts the catalog entry needs.

## Contract

- Input: plan, audit (existing products, drafts included), allowlist.
- Output: one JSON file; no network, no writes to WordPress.
- `draft` is a normal outcome: the reasons travel into `review_note`.

## Validation

`node --check scripts/gate.mjs`; `test/shop-lib.test.mjs` covers all three verdicts.
