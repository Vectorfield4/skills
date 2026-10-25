---
name: wp-publish
description: "Step 5 (optional publish) of the news-article chain news-fetcher -> published-check -> article-extractor -> translate-article -> wp-publish: sends a finished article to WordPress as a post from a local JSON built out of articles/<slug>.ru.md, after which wp-record writes wp_id/wp_url back into the frontmatter. Writes one article to a WordPress REST API. The caller supplies a site config that names the host and can point at environment variables for credentials. Supports basic and bearer auth and a dry run. Triggers: wp-publish, wordpress-publish, WordPress publish, publish article to WordPress, publish the article, WP publish, push article to WordPress, create WordPress post, загрузить статью в WordPress, опубликовать статью."
---

# WordPress publish

Write article data to a WordPress site. The caller supplies the site config, so this skill never assumes a host, a user or a secret. One job: send one article to the REST API.

End-to-end runs are owned by the `content-translate-related-articles` agent; run this skill
alone only when the caller already has the article JSON and the site config.

## Config

Pass a JSON config with `--config`. The caller owns this file. Keep secrets in environment variables and name them with `keyName` or `env`.

```json
{
  "baseUrl": "https://example.com",
  "auth": {
    "type": "basic",
    "user": "admin",
    "password": { "keyName": "SITE_APP_PASSWORD" }
  }
}
```

`baseUrl` accepts a site URL, with or without `/wp-json`.

Every value accepts one of four shapes:

- direct string: `"baseUrl": "https://example.com"`, `"password": "literal"`.
- `{ "keyName": "SITE_APP_PASSWORD" }`: read `process.env.SITE_APP_PASSWORD`.
- `{ "env": "SITE_APP_PASSWORD" }`: same read, alternate spelling.
- `{ "value": "literal" }`: use the literal value.

On Windows the resolver checks the current process first, then the user and machine
environment by name. Do not export the variable in the shell before running the script.

Shorthand keys skip the object form:

- `baseUrlKey`, `userKey`, `passwordKey`, `tokenKey` name environment variables.
- `auth.type` is `basic` or `bearer`. When it is absent, a token selects bearer auth and the rest falls back to basic.

Bearer auth:

```json
{
  "baseUrl": "https://example.com",
  "auth": { "type": "bearer", "token": { "keyName": "SITE_TOKEN" } }
}
```

Basic auth needs `user` and `password`. Bearer auth needs `token`. Missing values stop the run with a message naming what is absent. Direct secrets work, but a key keeps them out of the config file. Secrets are never printed, including on failure.

## Run

Run from this skill directory:

```bash
node scripts/publish.mjs --config site.json --file article.json [--out result.json] [--dry-run] [--upsert]
```

Prefer absolute paths for `--config`, `--file` and `--out` when those files live in a project.

`--config` is required unless the flags below supply a base URL and credentials. Flags override the config file, and a direct value beats a key for the same slot:

- `--base-url`, `--base-url-key`
- `--user`, `--user-key`
- `--password`, `--password-key`
- `--token`, `--token-key`
- `--auth-type basic|bearer`

Read credentials from the environment through the `*Key` flags. A literal `--password` or `--token` lands in shell history.

Dry run resolves the config, skips the network call, and prints the base URL, the auth type and the post payload. It prints nothing else. Run it before the first real publish:

```bash
node scripts/publish.mjs --config site.json --file article.json --dry-run
```

## Products for the post

A published story should not land without the products its tags point to. That
half is owned by the `product-match` skill and its `content-product-scout` agent;
call the agent before the first real publish, or run the scripts yourself:

```bash
node "$env:USERPROFILE/.config/opencode/skills/content/product-match/scripts/tags.mjs" \
  status --file data/<host>/tags.yaml
node "$env:USERPROFILE/.config/opencode/skills/content/product-match/scripts/match.mjs" \
  --article articles/<slug>.ru.md --registry data/<host>/tags.yaml \
  --store https://<host> --copy-images --out docs/research/product-match-<slug>.json
```

`tags.mjs status` exits `0` when the registry is under four hours old — then the
post's tags come from `data/<host>/tags.yaml` and no WordPress call is made. Exit
`1` means the tag pull is stale: the agent refreshes it through the WordPress
skill (`ewpa/get-tags`) and `tags.mjs sync`, never by inventing tags. `match.mjs`
records the article tags (`count + 1`, `latestUpdate` = now), copies product
images into `public/images/products/` and prints ready `<figure>` blocks whose
caption is the model name.

The registry is what tells the next run whether a tag already has products, so
publish the article and record its tags in the same pass — a post whose tags were
never recorded looks new to product matching.

## Idempotency

By default the skill **creates** a new post. If a post with the same `slug` already
exists, it stops with an error instead of creating a duplicate. Pass `--upsert`
to update the existing post in place. Always prefer `--upsert` when re-running
a publish for an article that may already be on the site.

## Input

Read a JSON file with these fields:

- `title`: plain text.
- `content`: HTML body.
- `excerpt`: plain text.
- `slug`: URL slug.
- `status`: `draft`, `publish`, `pending` or `private`.
- `date`: optional ISO date.
- `featured_media`: optional media ID.
- `categories`: optional array of category IDs.
- `tags`: optional array of tag IDs.

## Output

Print the created post JSON to stdout. With `--out`, write it to that file instead and confirm the path on stderr. `--out` applies to a real publish; a dry run always prints to stdout.

## Constraints

- Storage writes only. Do not discover links, collect sources or search the web.
- Do not translate, rewrite or summarize the article. Send it as given.
- Do not edit the site config from this skill, and do not hardcode a site, user or secret.
- Load the engine from `#lib/*`. Do not import repository code.
- Keep `publishArticle`, `wpEndpoint` and `toWpPost` behavior from `#lib/wp-client.mjs`.
- Return a non-zero exit code and a single error line on a config, file or request failure.

## Validation

- `node --check scripts/publish.mjs`
- `node scripts/publish.mjs --config site.json --file article.json --dry-run`
- In the skills repo: `npm test`.
