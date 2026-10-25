#!/usr/bin/env node
// Assign frontmatter tags to a WordPress post (resolve/create tag ids).

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isEntryPoint } from "#lib/cli.mjs";
import { resolveWpConfig } from "#lib/wp-config.mjs";

function parseArgs(argv) {
  const o = { article: null, host: null, key: null, user: "admin", postId: null, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--article") o.article = argv[++i];
    else if (a === "--host") o.host = argv[++i];
    else if (a === "--key") o.key = argv[++i];
    else if (a === "--user") o.user = argv[++i];
    else if (a === "--post-id") o.postId = Number(argv[++i]);
    else if (a === "--dry-run") o.dryRun = true;
  }
  return o;
}

function parseFrontmatter(raw) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!m) return null;
  const fm = m[1];
  const get = (k) => {
    const mm = fm.match(new RegExp(`^${k}:\\s*(.*)$`, "m"));
    return mm ? mm[1].trim().replace(/\r$/, "") : null;
  };
  const tagsRaw = get("tags");
  let tags = [];
  if (tagsRaw) {
    try { tags = JSON.parse(tagsRaw); } catch {}
  }
  const wpId = get("wp_id");
  return { tags, wpId: wpId ? Number(wpId) : null };
}

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
  const meta = parseFrontmatter(raw);
  if (!meta) throw new Error("no frontmatter");
  const id = postId ?? meta.wpId;
  if (!id) throw new Error("no wp_id in frontmatter (pass --post-id)");
  if (meta.tags.length === 0) throw new Error("no tags in frontmatter");

  const { baseUrl, authHeader } = resolveWpConfig({
    baseUrl: host,
    auth: { type: "basic", user, password: { keyName: key } },
  });
  const base = baseUrl.replace(/\/+$/, "");

  const ids = [];
  for (const name of meta.tags) {
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
  return { postId: id, tags: ids, names: meta.tags, dryRun };
}

export async function run(argv = process.argv.slice(2)) {
  const o = parseArgs(argv);
  if (!o.article || !o.host || !o.key) {
    console.error("Usage: node sync.mjs --article <md> --host <url> --key <ENV> [--user admin] [--post-id N] [--dry-run]");
    process.exitCode = 1;
    return null;
  }
  try {
    const r = await sync(o.article, { host: o.host, key: o.key, user: o.user, postId: o.postId, dryRun: o.dryRun });
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