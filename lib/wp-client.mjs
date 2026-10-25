// Shared WordPress REST client.
//
// `wpEndpoint` builds `/wp-json/wp/v2/...` URLs, `toWpPost` maps a plain article
// object onto post fields, and `publishArticle` posts it. The `auth` argument is
// the full Authorization header value, for example the `authHeader` that
// `resolveWpConfig` in `wp-config.mjs` returns.

export function wpEndpoint(baseUrl, path) {
  const base = String(baseUrl ?? "").replace(/\/+$/, "");
  const api = base.endsWith("/wp-json") ? base : `${base}/wp-json`;
  const suffix = String(path ?? "").replace(/^\/+/, "");
  return `${api}/wp/v2/${suffix}`;
}

export function toWpPost(article) {
  const post = {
    title: article?.title ?? "",
    content: article?.content ?? "",
    status: article?.status ?? "draft",
  };
  if (article?.excerpt) post.excerpt = article.excerpt;
  if (article?.slug) post.slug = article.slug;
  if (article?.date) post.date = article.date;
  if (article?.featured_media) post.featured_media = article.featured_media;
  if (Array.isArray(article?.categories)) post.categories = article.categories;
  if (Array.isArray(article?.tags)) post.tags = article.tags;
  return post;
}

export async function wpRequest(baseUrl, path, { method = "GET", auth, body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (auth) headers.Authorization = auth;
  const response = await fetch(wpEndpoint(baseUrl, path), {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    const suffix = detail ? `: ${detail}` : "";
    throw new Error(`WordPress request failed: ${response.status} ${response.statusText}${suffix}`);
  }
  return response.json();
}

export async function findPostBySlug(baseUrl, auth, slug) {
  if (!slug) return null;
  const path = `posts?slug=${encodeURIComponent(slug)}&status=any&per_page=1`;
  const result = await wpRequest(baseUrl, path, { method: "GET", auth });
  if (Array.isArray(result) && result.length > 0) return result[0];
  return null;
}

export async function updateArticle(baseUrl, auth, id, article) {
  return wpRequest(baseUrl, `posts/${id}`, {
    method: "POST",
    auth,
    body: toWpPost(article),
  });
}

export async function publishArticle(baseUrl, auth, article) {
  return wpRequest(baseUrl, "posts", {
    method: "POST",
    auth,
    body: toWpPost(article),
  });
}

export async function upsertArticle(baseUrl, auth, article) {
  const existing = await findPostBySlug(baseUrl, auth, article?.slug);
  if (existing && existing.id) {
    return updateArticle(baseUrl, auth, existing.id, article);
  }
  return publishArticle(baseUrl, auth, article);
}