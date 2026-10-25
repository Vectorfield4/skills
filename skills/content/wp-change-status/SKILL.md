---
name: wp-change-status
description: "Updates the status of one or more WordPress posts (publish/draft/pending/private) via the REST API using basic auth from an environment variable. Prints the resulting post id, status and link. Triggers: wordpress status, wp status, publish wp posts, set post status, опубликовать посты, статус постов wordpress."
---

# WordPress post status

Update the `status` of existing WordPress posts. The caller supplies the host and
the name of an environment variable holding the application password; the script
resolves the secret from the process/user/machine environment (Windows registry
included) and never prints it.

## Run

```bash
node scripts/status.mjs --host <host> --key <ENV_VAR_NAME> [--user admin] [--ids 44-50] [--status publish] [--dry-run]
```

- `--host` (required): site host or full URL, e.g. `https://hello-robot.ru`.
- `--key` (required): name of the environment variable holding the app password.
- `--user` (optional, default `admin`).
- `--ids` (optional): comma list or range (`44-50`, `44,45,46`). Default: none (prints usage).
- `--status` (optional, default `publish`): `publish`, `draft`, `pending`, `private`.
- `--dry-run`: resolve config and print what would be sent; no network call.

## Output

For each post: `post <id> -> status=<status> link=<link>` or `post <id> FAILED: <error>`.

## Constraints

- Storage writes only. No article discovery, no translation.
- Secrets are never printed, including on failure.
- Non-zero exit code on config failure.
