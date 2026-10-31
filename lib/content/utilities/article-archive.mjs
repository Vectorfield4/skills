// The article archive: what this project has already published.
//
// `published-check` used to carry its own frontmatter parser, its own title
// normalizer and its own matcher. This module keeps the matcher and its
// precedence exactly, so switching that skill over changes no verdict, and
// reads every file through `#lib/content/utilities/read-article.mjs`.
//
// The archive is a Map keyed by slug. A `<slug>.ru.md` and `<slug>.en.md` pair
// lands in one entry: the article is covered when either locale says so.

import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { articleSlug } from "#lib/article.mjs";
import { canonicalizeUrl } from "#lib/article-search.mjs";
import { normalizeTitle, parseArticle } from "#lib/content/utilities/read-article.mjs";

/** Last path segment of a URL, without an `.html` style suffix. */
function slugFromUrl(url) {
  try {
    const parts = new URL(url).pathname.split("/").filter(Boolean);
    return (parts[parts.length - 1] ?? "").replace(/\.(html?|php)$/i, "");
  } catch {
    return "";
  }
}

/** One empty archive entry, so both locales of a slug merge into one record. */
function emptyEntry(slug) {
  return { slug, files: [], sourceUrls: new Set(), titles: new Set(), statuses: new Set() };
}

/**
 * Indexes every `*.md` in `dir`. The entry slug is the declared `slug` field or
 * the file name without its locale suffix. Source URLs are canonical, titles
 * are normalized, and both sets absorb every locale of the same article.
 *
 * Throws `articles dir not found: <dir>` so a missing path is never read as an
 * empty archive, which would report everything as fresh.
 */
export function archiveFromDir(dir) {
  const root = resolve(dir);

  let files;
  try {
    files = readdirSync(root).filter((file) => file.endsWith(".md"));
  } catch {
    throw new Error(`articles dir not found: ${dir}`);
  }

  const archive = new Map();
  for (const file of files.sort()) {
    const article = parseArticle(readFileSync(join(root, file), "utf8"));
    const slug = article.slug || articleSlug(file);
    const entry = archive.get(slug) ?? emptyEntry(slug);

    entry.files.push(file);
    if (article.sourceUrl) entry.sourceUrls.add(canonicalizeUrl(article.sourceUrl));
    if (article.title) entry.titles.add(normalizeTitle(article.title));
    if (article.status) entry.statuses.add(article.status);

    archive.set(slug, entry);
  }

  return archive;
}

/**
 * WordPress posts from a dump: a raw array or `{ posts: [...] }`. Every URL is
 * canonicalized and every title normalized, so a match never depends on the
 * dump's formatting.
 */
export function parsePosts(json) {
  const list = Array.isArray(json) ? json : (json?.posts ?? []);
  return list.map((post) => ({
    slug: post.slug ?? "",
    title: normalizeTitle(post.title),
    status: post.status ?? "",
    urls: [post.link, post.url, post.source_url, post.sourceUrl].filter(Boolean).map(canonicalizeUrl),
  }));
}

/**
 * Why a candidate is already covered, or `null` when it is fresh.
 *
 * Precedence, copied from `published-check` so its verdicts do not move:
 * source URL, then slug, then title inside the archive; wp_url, wp_slug,
 * wp_title across the WordPress posts.
 */
export function matchCandidate(candidate, archive, posts = []) {
  const url = candidate?.url ? canonicalizeUrl(candidate.url) : "";
  const slug = slugFromUrl(candidate?.url ?? "");
  const title = normalizeTitle(candidate?.title);

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

  for (const post of posts ?? []) {
    const postUrls = post.urls ?? [post.link, post.url, post.source_url, post.sourceUrl].filter(Boolean).map(canonicalizeUrl);
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
