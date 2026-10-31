#!/usr/bin/env node
// Assign frontmatter tags to a WordPress post (resolve/create tag ids).

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isEntryPoint, parseFlags, wantsHelp } from "#lib/cli.mjs";
import { parseArticle } from "#lib/content/utilities/read-article.mjs";
import { resolveWpConfig } from "#lib/wp-config.mjs";

const USAGE = `sync - assign frontmatter tags to a WordPress post

  node sync.mjs --article <md> --host <url> --key <ENV> [--user admin] [--post-id N] [--dry-run] [--help]

Flags
  --article   Article markdown file. Required.
  --host      WordPress base URL. Required.
  --key       Environment variable holding the application password. Required.
  --user      WordPress user (default admin).
  --post-id   Override the post id from frontmatter.
  --dry-run   Resolve tags without writing.
  --help      Print this block and exit 0.

Exit codes
  0  success     1  runtime error     2  usage error
`;

function slugify(name) {
  return String(name).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "");
}

async function api(base, auth, path, opts = {}) {
  const res = await fetch(`${base}/wp-json/wp/v2/${path}`, {
    ...opts,
    headers: { Authorization: auth, "Content-Type": "application/json", ...(opts.headers || {}) },
  });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function sync(articlePath, { host, key, user = "admin", postId = null, dryRun = false } = {}) {
  const raw = readFileSync(resolve(articlePath), "utf8");
  const article = parseArticle(raw);
  const tags = article.tags;
  const wpId = article.wpId;
  const id = postId ?? wpId;
  if (!id) throw new Error("no wp_id in frontmatter (pass --post-id)");
  if (tags.length === 0) throw new Error("no tags in frontmatter");

  const { baseUrl, authHeader } = resolveWpConfig({
    baseUrl: host,
    auth: { type: "basic", user, password: { keyName: key } },
  });
  const base = baseUrl.replace(/\/+$/, "");

  const ids = [];
  for (const name of tags) {
    const slug = slugify(name);
    const found = await api(base, authHeader, `tags?slug=${encodeURIComponent(slug)}&per_page=1`);
    if (Array.isArray(found) && found.length > 0) {
      ids.push(found[0].id);
    } else if (dryRun) {
      ids.push(`new:${name}`);
    } else {
      const created = await api(base, authHeader, "tags", { method: "POST", body: JSON.stringify({ name }) });
      ids.push(created.id);
    }
  }

  if (!dryRun) {
    await api(base, authHeader, `posts/${id}`, { method: "POST", body: JSON.stringify({ tags: ids }) });
  }
  return { postId: id, tags: ids, names: tags, dryRun };
}

export async function run(argv = process.argv.slice(2)) {
  if (wantsHelp(argv)) {
    process.stdout.write(`${USAGE}\n`);
    return 0;
  }

  let flags;
  try {
    flags = parseFlags(argv, {
      article: "string",
      host: "string",
      key: "string",
      user: "string",
      "post-id": "number",
      "dry-run": "boolean",
      help: "boolean",
    });
  } catch (error) {
    process.stderr.write(`${error.message}\n\n${USAGE}`);
    process.exitCode = 2;
    return null;
  }

  if (!flags.article || !flags.host || !flags.key) {
    process.stderr.write(`Usage: node sync.mjs --article <md> --host <url> --key <ENV> [--user admin] [--post-id N] [--dry-run] [--help]\n\n${USAGE}`);
    process.exitCode = 2;
    return null;
  }

  try {
    const r = await sync(flags.article, {
      host: flags.host,
      key: flags.key,
      user: flags.user ?? "admin",
      postId: flags["post-id"] ?? null,
      dryRun: Boolean(flags["dry-run"]),
    });
    console.log(`post ${r.postId} -> tags ${r.tags.join(",")} (${r.names.join(", ")})${r.dryRun ? " [dry-run]" : ""}`);
    return r;
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
    return null;
  }
}

if (isEntryPoint(import.meta.url)) {
  await run();
}
