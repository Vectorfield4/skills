// WooCommerce REST v3 + WordPress REST + Store API, no dependencies.
//
// Used by the shop nodes that must see drafts: the public Store API hides them,
// which is exactly the trap that made `list` answer "no products" while twelve
// drafts sat in the admin.

import { readEnv } from "../env.mjs";
import { noteRequest } from "./metrics.mjs";

export const DEFAULT_URL = "https://hello-robot.ru";
export const PAGE_SIZE = 100;
export const MAX_PAGES = 20;

/** Thrown for a workflow error (missing keys, unreachable site), never a bug. */
export class ShopError extends Error {}

export function resolveSite(env = process.env) {
  const url = String(readEnv("HELLOROBOT_WP_URL", env) ?? DEFAULT_URL).replace(/\/+$/, "");
  return {
    url,
    key: String(readEnv("HELLOROBOT_WC_KEY", env) ?? ""),
    secret: String(readEnv("HELLOROBOT_WC_SECRET", env) ?? ""),
  };
}

export function hasCredentials(site) {
  return Boolean(site?.key && site?.secret);
}

export function credentialsHint() {
  return "нет ключей WooCommerce: задайте HELLOROBOT_WC_KEY и HELLOROBOT_WC_SECRET (WooCommerce → Настройки → Дополнительно → REST API, права read/write)";
}

async function request(url, { method = "GET", body, headers = {} } = {}) {
  noteRequest(url);
  let host = url;
  try {
    host = new URL(url).host;
  } catch {}

  let response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        Accept: "application/json",
        "User-Agent": "opencode-skills/1.0",
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...headers,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch (error) {
    throw new ShopError(`нет связи с ${host}: ${error?.message ?? error}`);
  }

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok) {
    const snippet = String(typeof data === "string" ? data : JSON.stringify(data ?? ""))
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 200);
    const error = new ShopError(`${method} ${url} → HTTP ${response.status} ${snippet}`);
    error.status = response.status;
    throw error;
  }

  return data;
}

function wcUrl(site, path, query = {}) {
  const url = new URL(`${site.url}/wp-json/wc/v3${path}`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

/** WC REST call. A 401 retries with keys in the query: some hosts strip Authorization. */
export async function wcRequest(site, path, { method = "GET", query = {}, body } = {}) {
  if (!hasCredentials(site)) throw new ShopError(credentialsHint());
  const auth = Buffer.from(`${site.key}:${site.secret}`).toString("base64");
  try {
    return await request(wcUrl(site, path, query), {
      method,
      body,
      headers: { Authorization: `Basic ${auth}` },
    });
  } catch (error) {
    if (error?.status !== 401) throw error;
    return await request(
      wcUrl(site, path, { ...query, consumer_key: site.key, consumer_secret: site.secret }),
      { method, body },
    );
  }
}

/** Every product, drafts included, paginated. */
export async function wcProducts(site, { status = "any", perPage = PAGE_SIZE, maxPages = MAX_PAGES } = {}) {
  const items = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const batch = await wcRequest(site, "/products", {
      query: { per_page: perPage, page, status, _fields: "id,name,sku,status,tags,categories,images" },
    });
    if (!Array.isArray(batch) || batch.length === 0) break;
    items.push(...batch);
    if (batch.length < perPage) break;
  }
  return items;
}

export async function wcFindBySku(site, sku) {
  if (!sku) return null;
  const found = await wcRequest(site, "/products", {
    query: { sku, per_page: 1, status: "any" },
  });
  return Array.isArray(found) ? (found[0] ?? null) : null;
}

/**
 * Batch upsert: one POST /products/batch instead of two calls per sku.
 * `payloads` carry `id` for an update and nothing for a create.
 */
export async function wcBatch(site, payloads) {
  const create = payloads.filter((item) => !item.id);
  const update = payloads.filter((item) => item.id);
  if (create.length === 0 && update.length === 0) return [];

  const response = await wcRequest(site, "/products/batch", {
    method: "POST",
    body: { create, update },
  });
  const results = [];
  for (const item of response?.create ?? []) {
    results.push({ action: "create", id: item?.id, sku: item?.sku, status: item?.status, error: item?.error });
  }
  for (const item of response?.update ?? []) {
    results.push({ action: "update", id: item?.id, sku: item?.sku, status: item?.status, error: item?.error });
  }
  return results.sort((a, b) => String(a.sku).localeCompare(String(b.sku)));
}

/** Public Store API: only published products reach it. */
export async function storeProducts(baseUrl, { perPage = PAGE_SIZE, maxPages = MAX_PAGES } = {}) {
  const items = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const url = new URL(`${String(baseUrl).replace(/\/+$/, "")}/wp-json/wc/store/v1/products`);
    url.searchParams.set("per_page", String(perPage));
    url.searchParams.set("page", String(page));
    const batch = await request(url.toString());
    if (!Array.isArray(batch) || batch.length === 0) break;
    items.push(...batch);
    if (batch.length < perPage) break;
  }
  return items;
}

/** All published posts with their tag ids. Public endpoint, no auth. */
export async function wpPostsAll(baseUrl, { perPage = PAGE_SIZE, maxPages = MAX_PAGES } = {}) {
  const items = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const url = new URL(`${String(baseUrl).replace(/\/+$/, "")}/wp-json/wp/v2/posts`);
    url.searchParams.set("per_page", String(perPage));
    url.searchParams.set("page", String(page));
    url.searchParams.set("_fields", "id,slug,title,tags");
    const batch = await request(url.toString());
    if (!Array.isArray(batch) || batch.length === 0) break;
    items.push(...batch);
    if (batch.length < perPage) break;
  }
  return items;
}

/** Tag id → name. Public endpoint, no auth. */
export async function wpTagsAll(baseUrl, { perPage = PAGE_SIZE, maxPages = MAX_PAGES } = {}) {
  const items = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const url = new URL(`${String(baseUrl).replace(/\/+$/, "")}/wp-json/wp/v2/tags`);
    url.searchParams.set("per_page", String(perPage));
    url.searchParams.set("page", String(page));
    url.searchParams.set("_fields", "id,name,count");
    const batch = await request(url.toString());
    if (!Array.isArray(batch) || batch.length === 0) break;
    items.push(...batch);
    if (batch.length < perPage) break;
  }
  return items;
}

/** Product id lookup by slug on the public Store API (used by verify). */
export async function storeProductBySlug(baseUrl, slug) {
  const url = new URL(`${String(baseUrl).replace(/\/+$/, "")}/wp-json/wc/store/v1/products`);
  url.searchParams.set("slug", slug);
  url.searchParams.set("per_page", "1");
  const found = await request(url.toString());
  return Array.isArray(found) ? (found[0] ?? null) : null;
}
