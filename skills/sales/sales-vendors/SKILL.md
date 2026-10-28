---
name: sales-vendors
description: "Brand allowlist for the shop: reads, checks and extends data/<host>/sellers.yaml — the internal trustworthy signal that decides whether a harvested product may be published. Never rendered on the site. Triggers: shop vendors, brand allowlist, trustworthy brand, добавить бренд, список брендов, allowlist продавцов."
---

# shop-vendors

One job: answer "may we sell this brand?" without asking a human, and keep the
answer in one local file.

The file is `data/<host>/sellers.yaml` (gitignored). `docs/sellers.example.yaml`
in the project seeds it on the first run, so a fresh clone starts from the list
we already trust.

## Commands

```bash
node scripts/vendors.mjs init  [--example docs/sellers.example.yaml]
node scripts/vendors.mjs list
node scripts/vendors.mjs check --brand Unitree | --domain unitree.com
node scripts/vendors.mjs add   --name Unitree --domain unitree.com \
                               [--kind brand] [--flagship "G1, H2"] [--note "…"]
```

Exit `0` — done / brand is in the allowlist, `1` — brand is not in the allowlist,
`2` — workflow error (bad file, missing flags).

## File shape

```yaml
host: hello-robot.ru
updated_at: "2026-10-24T09:12:00Z"
items:
  - name: Unitree
    domain: unitree.com
    kind: brand
    flagship: "G1, H2"
    note: ""
```

`kind` is `brand` or `seller`. `flagship` is a comma list of top-tier models; it
is the premium signal when the brand page has no public price. Keys are sorted on
write, so a re-run does not churn the file.

## Contract

- Input: the file, plus a brand name or domain.
- Output: stdout verdict; `add` rewrites the file in the narrow schema.
- Never: invent a brand, edit `products/catalog.json`, publish anything.

## Validation

`node --check scripts/vendors.mjs`; in the skills repo `npm test` (see
`test/shop-lib.test.mjs`, `test/shop-nodes.test.mjs`).
