---
name: wp-record
description: "Reads a wordpress-publish result.json and updates the matching article's frontmatter (wp_id, wp_url, status) so the published post is not an orphan. Triggers: wp record, record wp post, update frontmatter wp, record wordpress result."
---

# WP record

Consume a `result.json` produced by `wp-publish` and write the returned `id`/`link`
back into the source article's frontmatter. Closes the `wp-publish -> article` loop.

## Run

```bash
node scripts/record.mjs --result result.json --article articles/<slug>.ru.md [--status published]
```

- `--result` (required): path to the publish result JSON.
- `--article` (required): path to the article `.md` file.
- `--status` (optional): set `status` in frontmatter (default: leave as-is).

## Constraints

- Edits only the frontmatter `wp_id`, `wp_url`, and optionally `status`.
- Does not publish or modify the post.