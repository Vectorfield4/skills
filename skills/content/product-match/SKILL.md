---
name: product-match
description: "Matches shop products to a news article, copies each product image into the project and builds a <figure> whose caption is the model name. Also owns the per-site tag registry data/<host>/tags.yaml: it reads the tags and the last WordPress sync date from that file, bumps count/latestUpdate for the tags an article uses, and refreshes the file only through the WordPress skill (ewpa/get-tags) when the sync is older than 4 hours. Runs on the news pipeline before publish. Triggers: product match, find products for article, products for news, product image, figure caption, tag registry, sync wp tags cache, подобрать товары под новость, товары для статьи, картинки товаров, реестр тегов, синхронизировать теги."
---

# Product match

One job: a news article gets the products that belong to it — matched by tag,
with the product image copied into the project and the model name as the caption.

The skill also owns the tag registry, because matching and publishing ask the
same question: *which tags do we have, and how old is the answer?* The registry
is a project file, `data/<host>/tags.yaml`, not a skill file.

End-to-end runs are owned by the `content-product-scout` agent and the
`content-translate-related-articles` agent's publish step. Run a script alone only
when the caller already has the article and the host.

## Registry

```yaml
host: hello-robot.ru
synced_at: "2026-10-24T09:12:00.000Z"
ttl_hours: 4
tags:
  Boston Dynamics:
    count: 1
    latestUpdate: "2026-10-24T09:12:00.000Z"
    id: 42
    wp_posts: 7
```

- `synced_at` — the last full pull from WordPress. `ttl_hours` — how long that
  pull stays usable, 4 by default.
- `count` — how many articles we recorded with this tag. Only `record` and the
  recording pass of `match.mjs` change it, never a sync.
- `latestUpdate` — when we recorded it last (the parse date of that article);
  `null` until an article uses the tag.
- `id`, `wp_posts` — WordPress facts from `ewpa/get-tags`; informational.

The file is not a general YAML document. Top-level scalars, `tags:` and one
nested map of tag → scalar fields. Anything else stops the run with a line
number instead of being dropped silently. `count` and `latestUpdate` are ours and
survive a sync; a sync never deletes a tag, so a locally counted tag that is gone
from WordPress stays in the file until a human removes it.

## Aliases node

The blog owns the tag vocabulary; the shop consumes it. Generate the alias map
instead of keeping a second copy:

```bash
node scripts/aliases.mjs [--source src/shared/config/productTags.ts] \
  [--host hello-robot.ru] [--out data/<host>/tag-aliases.json]
```

It parses `TAG_ALIASES` out of the project's TypeScript file without dependencies
and writes `data/<host>/tag-aliases.json` (host data, gitignored). Every shop node
reads that file, so `humanoid` and `гуманоиды` stay one tag without a duplicated
map drifting between the site and the scripts.

Exit `0` — file written, `2` — the source is missing or parsed empty.

## Freshness gate

Ask the cheap question first, before any WordPress call:

```bash
node scripts/tags.mjs status --file data/<host>/tags.yaml [--ttl-hours 4]
```

Exit `0` — fresh, use the file. Exit `1` — stale or never synced: the answer
must come from WordPress through the WordPress skill. Exit `2` — the file is
broken.

- **Fresh** — read `data/<host>/tags.yaml` and do not touch the network for tags.
- **Stale** — run the WordPress skill (`ewpa/get-tags` in a session that has the
  MCP, or whatever tag dump that skill prints), save the result as JSON, then:

```bash
node scripts/tags.mjs sync --file data/<host>/tags.yaml --input docs/research/wp-tags.json --host <host>
```

`sync` merges the dump: IDs and post counts are refreshed, `synced_at` is
stamped, local `count`/`latestUpdate` are kept. `--input` accepts an array or an
envelope with a `tags` / `data` / `items` array, so the raw MCP result works.

Record the tags an article uses — this is the counter the next runs read:

```bash
node scripts/tags.mjs record --file data/<host>/tags.yaml --tags "Boston Dynamics,гуманоиды"
```

`list` prints the registry by usage. None of these commands call WordPress.

## Match products

```bash
node scripts/match.mjs --article articles/<slug>.ru.md \
  --registry data/<host>/tags.yaml \
  --catalog products/catalog.json \
  --store https://example.com \
  --copy-images --out docs/research/product-match-<slug>.json
```

- `--article` — tags and text come from the frontmatter and body; `--tags "a,b"`
  works instead when the article is not on disk yet.
- `--registry` — recording is on by default: each article tag gets `count + 1`
  and `latestUpdate = now`. `--no-record` makes the run read-only. A stale or
  missing registry is reported in `warnings`, never refreshed from here.
- `--catalog` — the project's `products/catalog.json` (array or `{ products }`).
  This is the source of truth for what we sell.
- `--store` — WooCommerce Store API base URL. Live products win on images and
  status, tags are unioned with the catalog. Draft products are invisible there,
  which is why the catalog matters.
- `--aliases` — JSON map `{ "гуманоиды": ["humanoid", "humanoids"] }`, the same
  shape as `TAG_ALIASES` in the project. Defaults to
  `data/<host>/tag-aliases.json` when that file exists.

Scoring: tag overlap is 2 points per canonical tag, a product name found in the
article text is 3 (`Unitree G1` in the body or the title). Only positive scores
are returned, highest first, capped by `--limit` (3).

Exit `0` — at least one match, `1` — none, `2` — error.

## Images and captions

`--copy-images` downloads the first product image into `--assets`
(default `public/images/products`) as `<sku>.<ext>`, skipping files that already
exist, and fills a ready figure block per match:

```html
<figure>
  <img src="/images/products/hr-unitree-g1.jpg" alt="Unitree G1" loading="lazy" />
  <figcaption>Unitree G1</figcaption>
</figure>
```

The caption is the model name and nothing else — no price, no marketing line, no
"фото". The URL is derived from the assets directory with `public/` stripped, so
Astro serves the file from the site root. A failed download is a warning, not a
stopped run: the match keeps its remote `image.remote` and gets no `figure`.

## Output

With `--out`, the JSON report is written there and a `score / sku / name / tags`
table goes to stdout. Without `--out`, the report itself goes to stdout:

```json
{
  "article": { "file": "articles/x.ru.md", "slug": "x", "title": "…" },
  "tags": ["гуманоиды", "Boston Dynamics"],
  "registry": { "file": "…", "fresh": true, "recorded": [{ "name": "…", "count": 3 }] },
  "sources": { "catalogProducts": 12, "storeProducts": 4, "aliases": "…" },
  "images": { "copied": 2, "reused": 0, "files": [] },
  "matches": [
    {
      "sku": "HR-UNITREE-G1",
      "name": "Unitree G1",
      "score": 7,
      "matched": ["гуманоиды"],
      "nameHit": true,
      "image": { "remote": "…", "file": "…", "url": "/images/products/hr-unitree-g1.jpg" },
      "caption": "Unitree G1",
      "figure": "<figure>…</figure>"
    }
  ],
  "warnings": []
}
```

## Constraints

- No WordPress calls for tags: the registry is filled from the WordPress skill
  output. This script only stamps and merges.
- Never invent a product, a price, a SKU or an image URL. A tag with no product
  gets an empty match list, not a plausible robot.
- Do not edit `products/catalog.json` or create WooCommerce products — that is
  the `shop-catalog` and `shop-write` nodes, run through `content-shop-filler`.
- Do not rewrite the article beyond inserting a returned figure, and only when
  the caller asked for it.
- Load shared code from `#lib/*`. Keep the registry codec narrow; do not turn it
  into a general YAML parser.

## Validation

- `node --check scripts/tags.mjs`
- `node --check scripts/match.mjs`
- In the skills repo: `npm test` (see `test/product-match.test.mjs`).
