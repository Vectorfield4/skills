#!/usr/bin/env node
// Coverage check: which candidates already have an article pair (and its translation)?
//
// Answers one question before any parsing or translation: has this story been
// published already? A candidate is covered when its canonical URL, its slug or
// its normalized title matches a markdown pair in the project's articles/ dir,
// or an existing post in a WordPress dump.

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { canonicalizeUrl } from "#lib/article-search.mjs";
import { isEntryPoint, parseFlags } from "#lib/cli.mjs";

function readFrontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return {};
  const fm = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (!kv) continue;
    fm[kv[1]] = kv[2].trim().replace(/^["']|["']$/g, "");
  }
  return fm;
}

function readJson(file) {
  return JSON.parse(readFileSync(resolve(file), "utf8").replace(/^\uFEFF/, ""));
}

function slugFromUrl(url) {
  try {
    const parts = new URL(url).pathname.split("/").filter(Boolean);
    return (parts[parts.length - 1] ?? "").replace(/\.(html?|php)$/i, "");
  } catch {
    return "";
  }
}

function normalizeTitle(title) {
  return String(title ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Index every articles/<slug>.<lang>.md pair by slug and by what it claims to cover. */
export function loadArchive(dir) {
  const bySlug = new Map();
  let files;
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".md"));
  } catch {
    throw new Error(`articles dir not found: ${dir}`);
  }

  for (const file of files) {
    const fileSlug = file.replace(/\.(ru|en)\.md$/, "");
    const fm = readFrontmatter(readFileSync(join(dir, file), "utf8"));
    const slug = fm.slug || fileSlug;
    const entry = bySlug.get(slug) ?? {
      slug,
      files: [],
      sourceUrls: new Set(),
      titles: new Set(),
      statuses: new Set(),
    };
    entry.files.push(file);
    if (fm.source_url) entry.sourceUrls.add(canonicalizeUrl(fm.source_url));
    if (fm.title) entry.titles.add(normalizeTitle(fm.title));
    if (fm.status) entry.statuses.add(fm.status);
    bySlug.set(slug, entry);
  }
  return bySlug;
}

/** Optional dump of existing WP posts: [{ slug, title, status, link, source_url }]. */
export function loadPosts(file) {
  if (!file) return [];
  const raw = readJson(file);
  const list = Array.isArray(raw) ? raw : (raw.posts ?? []);
  return list.map((p) => ({
    slug: p.slug ?? "",
    title: normalizeTitle(p.title),
    status: p.status ?? "",
    urls: [p.link, p.url, p.source_url, p.sourceUrl].filter(Boolean).map(canonicalizeUrl),
  }));
}

function matchCandidate(candidate, archive, posts) {
  const url = candidate.url ? canonicalizeUrl(candidate.url) : "";
  const slug = slugFromUrl(candidate.url ?? "");
  const title = normalizeTitle(candidate.title);

  for (const entry of archive.values()) {
    if (url && entry.sourceUrls.has(url)) {
      return { kind: "source_url", slug: entry.slug, file: entry.files[0], status: [...entry.statuses][0] ?? "" };
    }
  }
  const bySlug = archive.get(slug);
  if (slug && bySlug) {
    return { kind: "slug", slug: bySlug.slug, file: bySlug.files[0], status: [...bySlug.statuses][0] ?? "" };
  }
  if (title) {
    for (const entry of archive.values()) {
      if (entry.titles.has(title)) {
        return { kind: "title", slug: entry.slug, file: entry.files[0], status: [...entry.statuses][0] ?? "" };
      }
    }
  }
  for (const post of posts) {
    const postUrls =
      post.urls ??
      [post.link, post.url, post.source_url, post.sourceUrl]
        .filter(Boolean)
        .map(canonicalizeUrl);
    const postSlug = post.slug ?? "";
    const postTitle = normalizeTitle(post.title);
    if (url && postUrls.includes(url)) {
      return { kind: "wp_url", slug: postSlug, file: "", status: post.status };
    }
    if (slug && postSlug === slug) {
      return { kind: "wp_slug", slug: postSlug, file: "", status: post.status };
    }
    if (title && postTitle === title) {
      return { kind: "wp_title", slug: postSlug, file: "", status: post.status };
    }
  }
  return null;
}

/** Split candidates into `fresh` and `covered`, keeping the match reason. */
export function checkCoverage(candidates, archive, posts = []) {
  const fresh = [];
  const covered = [];
  for (const candidate of candidates) {
    const matched = matchCandidate(candidate, archive, posts);
    if (matched) covered.push({ ...candidate, matched });
    else fresh.push(candidate);
  }
  return { fresh, covered };
}

export async function run(argv = process.argv.slice(2)) {
  const flags = parseFlags(argv, {
    file: "string",
    articles: "string",
    wp: "string",
    out: "string",
    json: "boolean",
  });
  if (!flags.file) {
    console.error("Usage: node check.mjs --file candidates.json [--articles articles] [--wp wp-posts.json] [--out coverage.json]");
    process.exitCode = 1;
    return null;
  }

  const candidates = readJson(flags.file);
  const list = Array.isArray(candidates) ? candidates : (candidates.candidates ?? []);
  const archive = loadArchive(resolve(flags.articles ?? "articles"));
  const posts = loadPosts(flags.wp);
  const result = checkCoverage(list, archive, posts);
  const json = JSON.stringify(result, null, 2);

  if (flags.out) {
    writeFileSync(resolve(flags.out), `${json}\n`, "utf8");
    console.error(`Wrote ${result.fresh.length} fresh and ${result.covered.length} covered to ${flags.out}`);
  } else {
    console.log(json);
  }
  return result;
}

if (isEntryPoint(import.meta.url)) {
  await run();
}
