---
name: wp-sync-tags
description: "Reads an article's frontmatter tags and assigns them to its WordPress post (resolving or creating tags by name via the REST API). Closes the article-frontmatter -> WP-tags loop. Triggers: wp sync tags, sync tags, set post tags, wordpress tags, проставить теги."
---

# WP sync tags

Assign the `tags: [...]` list from an article's frontmatter to its WordPress post.
WP REST expects tag IDs, so the script resolves each name to an id (creating the
tag when it does not exist) and sends the id list.

## Run

```bash
node scripts/sync.mjs --article articles/<slug>.ru.md --host https://example.com --key APP_PASSWORD [--user admin] [--post-id <id>] [--dry-run]
```

- `--article` (required): markdown file with `tags` and `wp_id` in frontmatter.
- `--host` (required): site URL.
- `--key` (required): env var holding the application password.
- `--user` (optional, default `admin`).
- `--post-id` (optional): override the `wp_id` from frontmatter.
- `--dry-run`: print resolved tag ids without updating the post.

## Output

`post <id> -> tags <ids> (<names>)`.

## Constraints

- Only tags and the post's tag list. Does not touch title, content or status.
- Secrets are never printed.