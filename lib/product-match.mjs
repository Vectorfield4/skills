// Tag registry and product matching for the news pipeline.
//
// The registry is the project file `data/<host>/tags.yaml`. It answers two
// questions without calling WordPress on every run:
//
//   - which tags exist, with a usage counter and the last time we recorded one
//     (`count`, `latestUpdate`);
//   - how old the last full WordPress sync is (`synced_at`, `ttl_hours`).
//
// Article writers read the registry, bump the counter for the tags they used and
// refresh the whole file through the WordPress skill only when `synced_at` is
// older than `ttl_hours` (default 4). Products are matched to the same tags so a
// story gets a "buy this robot" figure with the model name as its caption.
//
// The codec is deliberately narrow: top-level scalars, `tags:` and one nested
// map of tag -> scalar fields. It is not a general YAML parser — anything else
// throws with a line number instead of being dropped silently.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export const DEFAULT_TTL_HOURS = 4;
export const DEFAULT_ASSETS = "public/images/products";
export const DEFAULT_LIMIT = 3;

const TAG_FIELDS = ["count", "latestUpdate", "id", "wp_posts"];
const REGISTRY_SCALARS = ["host", "synced_at", "ttl_hours"];

// --- Tags ------------------------------------------------------------------

/**
 * Tag normalization: lowercase, ё→е, punctuation and extra spaces out.
 * "  Промышленная,  РОБОТОТЕХНИКА! " → "промышленная робототехника"
 */
export function normalizeTag(raw) {
  return String(raw ?? "")
    .toLowerCase()
    .replaceAll("ё", "е")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** alias map (canonical -> spellings) into a lookup of normalized key -> canonical key. */
export function buildAliasIndex(aliases = {}) {
  const index = new Map();
  for (const [canonical, list] of Object.entries(aliases ?? {})) {
    const key = normalizeTag(canonical);
    if (!key) continue;
    if (!index.has(key)) index.set(key, key);
    for (const alias of Array.isArray(list) ? list : [alias]) {
      const aliasKey = normalizeTag(alias);
      if (aliasKey && !index.has(aliasKey)) index.set(aliasKey, key);
    }
  }
  return index;
}

/** Canonical form of a tag: normalization plus alias folding, both directions. */
export function canonicalTag(raw, index = new Map()) {
  const key = normalizeTag(raw);
  return index.get(key) ?? key;
}

/** Tags are strings in a catalog and {id,name,slug} objects in the Store API. */
export function tagNames(tags) {
  return (Array.isArray(tags) ? tags : [])
    .map((tag) => (typeof tag === "string" ? tag : tag?.name))
    .map((name) => String(name ?? "").trim())
    .filter(Boolean);
}

export function splitTags(value) {
  return String(value ?? "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

// --- Registry codec --------------------------------------------------------

export function emptyRegistry({ host = null, ttlHours = DEFAULT_TTL_HOURS } = {}) {
  return { host, syncedAt: null, ttlHours, tags: {} };
}

function unquote(text) {
  return text.replace(/\\(["\\])/g, "$1");
}

function parseScalar(raw) {
  const value = String(raw ?? "").trim();
  if (value === "" || value === "null" || value === "~") return null;
  if (value.startsWith('"')) {
    const end = value.lastIndexOf('"');
    if (end <= 0) throw new Error("unterminated quoted value");
    return unquote(value.slice(1, end));
  }
  return value;
}

function splitPair(body, lineNumber) {
  const text = body.trim();

  if (text.startsWith('"')) {
    const end = text.indexOf('"', 1);
    if (end === -1) throw new Error(`line ${lineNumber}: unterminated quoted key`);
    const key = unquote(text.slice(1, end));
    const rest = text.slice(end + 1).trim();
    if (!rest.startsWith(":")) throw new Error(`line ${lineNumber}: expected ":" after key`);
    return { key, value: parseScalar(rest.slice(1)) };
  }

  const sep = text.indexOf(": ");
  if (sep !== -1) return { key: text.slice(0, sep).trim(), value: parseScalar(text.slice(sep + 1)) };
  if (text.endsWith(":")) return { key: text.slice(0, -1).trim(), value: null };
  throw new Error(`line ${lineNumber}: expected "key: value"`);
}

function indentOf(line) {
  if (line.includes("\t")) throw new Error("tabs are not allowed in the registry");
  return line.length - line.trimStart().length;
}

/** Parse the registry text. Throws on anything outside the narrow schema. */
export function parseRegistry(text) {
  const registry = emptyRegistry();
  let section = null;
  let currentTag = null;
  const lines = String(text ?? "").split(/\r?\n/);

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;

    const indent = indentOf(line);
    if (indent === 0) {
      currentTag = null;
      section = null;
      const { key, value } = splitPair(line, lineNumber);

      if (key === "tags") {
        if (value !== null) throw new Error(`line ${lineNumber}: "tags" must be a block`);
        section = "tags";
        return;
      }
      if (!REGISTRY_SCALARS.includes(key)) {
        throw new Error(`line ${lineNumber}: unknown registry key "${key}"`);
      }
      if (key === "host") registry.host = value;
      if (key === "synced_at") registry.syncedAt = value;
      if (key === "ttl_hours") {
        const ttl = Number(value);
        if (!Number.isFinite(ttl) || ttl <= 0) throw new Error(`line ${lineNumber}: bad ttl_hours`);
        registry.ttlHours = ttl;
      }
      return;
    }

    if (section !== "tags") throw new Error(`line ${lineNumber}: unexpected indentation`);

    if (indent === 2) {
      const { key, value } = splitPair(line, lineNumber);
      if (value !== null) throw new Error(`line ${lineNumber}: tag "${key}" must be a block`);
      currentTag = key;
      registry.tags[key] = registry.tags[key] ?? { count: 0, latestUpdate: null };
      return;
    }

    if (indent === 4 && currentTag) {
      const { key, value } = splitPair(line, lineNumber);
      if (!TAG_FIELDS.includes(key)) {
        throw new Error(`line ${lineNumber}: unknown tag field "${key}"`);
      }
      const tag = registry.tags[currentTag];
      if (key === "count" || key === "id" || key === "wp_posts") {
        const number = Number(value);
        if (!Number.isFinite(number)) throw new Error(`line ${lineNumber}: ${key} must be a number`);
        tag[key] = number;
      } else {
        tag.latestUpdate = value;
      }
      return;
    }

    throw new Error(`line ${lineNumber}: unexpected indentation`);
  });

  return registry;
}

function isPlainKey(key) {
  return /^[\p{L}_][\p{L}\p{N}_.-]*$/u.test(key);
}

function quoteIfNeeded(value) {
  const text = String(value);
  return isPlainKey(text) ? text : `"${text.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function quoteTimestamps(value) {
  return value === null || value === undefined ? "null" : `"${String(value)}"`;
}

/** Registry -> YAML text. Keys are sorted so a re-run produces the same file. */
export function stringifyRegistry(registry) {
  const out = [];
  out.push(`host: ${registry?.host ? quoteIfNeeded(registry.host) : "null"}`);
  out.push(`synced_at: ${quoteTimestamps(registry?.syncedAt)}`);
  out.push(`ttl_hours: ${Number(registry?.ttlHours ?? DEFAULT_TTL_HOURS)}`);
  out.push("tags:");

  const names = Object.keys(registry?.tags ?? {}).sort((a, b) => a.localeCompare(b, "ru"));
  for (const name of names) {
    const tag = registry.tags[name] ?? {};
    out.push(`  ${quoteIfNeeded(name)}:`);
    out.push(`    count: ${Number(tag.count ?? 0)}`);
    out.push(`    latestUpdate: ${quoteTimestamps(tag.latestUpdate)}`);
    if (tag.id !== undefined && tag.id !== null) out.push(`    id: ${Number(tag.id)}`);
    if (tag.wp_posts !== undefined && tag.wp_posts !== null) {
      out.push(`    wp_posts: ${Number(tag.wp_posts)}`);
    }
  }

  return `${out.join("\n")}\n`;
}

export function readRegistry(file) {
  if (!file || !existsSync(file)) return null;
  return parseRegistry(readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
}

export function writeRegistry(file, registry) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, stringifyRegistry(registry), "utf8");
  return registry;
}

// --- Freshness -------------------------------------------------------------

function iso(now) {
  return new Date(now).toISOString();
}

/**
 * Is the registry usable without a WordPress call?
 * Returns { fresh, reason, ageMinutes, ttlHours, syncedAt }.
 * A missing/empty `synced_at` is never fresh; a future date is treated as fresh.
 */
export function registryStatus(registry, { now = new Date(), ttlHours } = {}) {
  const ttl = Number(ttlHours ?? registry?.ttlHours ?? DEFAULT_TTL_HOURS);
  const syncedAt = registry?.syncedAt ?? null;

  if (!syncedAt) {
    return { fresh: false, reason: "never-synced", ageMinutes: null, ttlHours: ttl, syncedAt };
  }

  const synced = new Date(syncedAt);
  if (Number.isNaN(synced.getTime())) {
    return { fresh: false, reason: "bad-date", ageMinutes: null, ttlHours: ttl, syncedAt };
  }

  const ageMinutes = Math.max(0, Math.round((new Date(now).getTime() - synced.getTime()) / 60_000));
  const fresh = ageMinutes < ttl * 60;
  return {
    fresh,
    reason: fresh ? "fresh" : "stale",
    ageMinutes,
    ttlHours: ttl,
    syncedAt,
  };
}

export function formatAge(minutes) {
  if (minutes === null || minutes === undefined) return "never";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

// --- Registry updates ------------------------------------------------------

/**
 * Merge a `ewpa/get-tags` dump into the registry.
 * Local usage (`count`, `latestUpdate`) is never overwritten; WordPress facts
 * (`id`, post count) are refreshed and the sync date is stamped.
 */
export function mergeWpTags(registry, wpTags, { now = new Date(), host } = {}) {
  const base = registry ?? emptyRegistry({ host });
  const stamp = iso(now);
  const tags = { ...base.tags };

  for (const wpTag of Array.isArray(wpTags) ? wpTags : []) {
    const name = String(wpTag?.name ?? "").trim();
    if (!name) continue;
    const existing = tags[name] ?? { count: 0, latestUpdate: null };
    tags[name] = { ...existing };
    if (wpTag.id !== undefined && wpTag.id !== null) tags[name].id = Number(wpTag.id);
    if (wpTag.count !== undefined && wpTag.count !== null) {
      tags[name].wp_posts = Number(wpTag.count);
    }
  }

  return { ...base, host: host ?? base.host, syncedAt: stamp, tags };
}

/**
 * Record that an article uses these tags: `count` + 1, `latestUpdate` = now.
 * An unknown tag is added (we know which tags we add), with count 1.
 */
export function recordTags(registry, names, { now = new Date(), host } = {}) {
  const base = registry ?? emptyRegistry({ host });
  const stamp = iso(now);
  const tags = { ...base.tags };
  const recorded = [];

  for (const raw of Array.isArray(names) ? names : []) {
    const name = String(raw ?? "").trim();
    if (!name) continue;
    const existing = tags[name] ?? { count: 0, latestUpdate: null };
    tags[name] = {
      ...existing,
      count: Number(existing.count ?? 0) + 1,
      latestUpdate: stamp,
    };
    recorded.push({ name, count: tags[name].count });
  }

  return { registry: { ...base, host: host ?? base.host, tags }, recorded };
}

// --- Products --------------------------------------------------------------

/** One shape for catalog, Store API and everything in between. */
export function normalizeProduct(raw, source = "catalog") {
  const images = (Array.isArray(raw?.images) ? raw.images : [])
    .map((image) => (typeof image === "string" ? image : image?.src))
    .map((src) => String(src ?? "").trim())
    .filter(Boolean);

  return {
    id: raw?.id ?? null,
    sku: String(raw?.sku ?? "").trim(),
    name: String(raw?.name ?? "").trim(),
    tags: tagNames(raw?.tags),
    images,
    status: raw?.status ?? "",
    source,
  };
}

/** Catalog first, live store second: the store wins on images/status, tags are unioned. */
export function mergeProducts(catalogProducts = [], storeProducts = []) {
  const byKey = new Map();
  const keyOf = (product) => product.sku || product.name;

  for (const raw of catalogProducts ?? []) {
    const product = normalizeProduct(raw, "catalog");
    byKey.set(keyOf(product), product);
  }

  for (const raw of storeProducts ?? []) {
    const product = normalizeProduct(raw, "store");
    const key = keyOf(product);
    const existing = byKey.get(key);
    byKey.set(
      key,
      existing
        ? {
            ...existing,
            ...product,
            tags: [...new Set([...existing.tags, ...product.tags])],
            images: product.images.length ? product.images : existing.images,
            source: "catalog+store",
          }
        : product,
    );
  }

  return [...byKey.values()];
}

function containsName(haystack, name) {
  const norm = normalizeTag(name);
  if (!norm) return false;
  if (haystack.includes(norm)) return true;
  const tokens = norm.split(" ").filter((token) => token.length >= 2);
  return tokens.length > 1 && tokens.every((token) => haystack.includes(token));
}

/**
 * Rank products for an article.
 * Tag overlap is 2 points per canonical tag, a model name found in the text is 3.
 * Returns only matches with a positive score, best first, capped by `limit`.
 */
export function matchProducts({ tags = [], products = [], text = "", aliases = {}, limit } = {}) {
  const index = buildAliasIndex(aliases);
  const wanted = [...new Set(tags.map((tag) => canonicalTag(tag, index)).filter(Boolean))];
  const haystack = normalizeTag(text);
  const cap = Number(limit ?? DEFAULT_LIMIT);

  const rows = [];
  for (const product of products ?? []) {
    const productTags = tagNames(product?.tags).map((tag) => canonicalTag(tag, index));
    const matched = wanted.filter((tag) => productTags.includes(tag));
    const nameHit = containsName(haystack, product?.name);
    const score = matched.length * 2 + (nameHit ? 3 : 0);
    if (score === 0) continue;
    rows.push({
      sku: product.sku,
      id: product.id,
      name: product.name,
      status: product.status,
      source: product.source,
      tags: product.tags,
      score,
      matched,
      nameHit,
      image: product.images[0] ?? null,
    });
  }

  rows.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, "ru"));
  return { wanted, matches: cap > 0 ? rows.slice(0, cap) : [] };
}

/** Local file name for a product image: sku-based, extension from the URL. */
export function imageFileName(sku, name, src) {
  const base = String(sku || name || "product")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  const ext = (String(src ?? "").match(/\.(jpe?g|png|webp|avif)(?:[?#]|$)/i)?.[1] ?? "jpg")
    .toLowerCase()
    .replace("jpeg", "jpg");
  return `${base || "product"}.${ext}`;
}

/** `public/images/products` + `x.jpg` -> `/images/products/x.jpg` (Astro serves public/ at root). */
export function assetUrl(assetsDir, fileName) {
  const normalized = String(assetsDir ?? "")
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/^\/+|\/+$/g, "");
  const relative = normalized.replace(/^public\/?/, "");
  return `/${[relative, fileName].filter(Boolean).join("/")}`.replace(/\/{2,}/g, "/");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Figure block for an article: the caption is the model name, nothing else. */
export function figureHtml({ caption, url }) {
  return [
    "<figure>",
    `  <img src="${escapeHtml(url)}" alt="${escapeHtml(caption)}" loading="lazy" />`,
    `  <figcaption>${escapeHtml(caption)}</figcaption>`,
    "</figure>",
  ].join("\n");
}

// --- Article ---------------------------------------------------------------

/** Frontmatter tags + title + body of an article file (block and inline lists). */
export function readArticle(text) {
  const raw = String(text ?? "").replace(/^\uFEFF/, "");
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  const frontmatter = match?.[1] ?? "";
  const body = match ? raw.slice(match[0].length) : raw;

  let title = "";
  let tags = [];
  let inTags = false;

  for (const line of frontmatter.split(/\r?\n/)) {
    const keyValue = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (keyValue) {
      inTags = false;
      const [, key, value] = keyValue;
      if (key === "title") title = value.trim().replace(/^["']|["']$/g, "");
      if (key === "tags") {
        const inline = value.trim();
        if (inline.startsWith("[")) {
          tags = inline
            .replace(/^\[|\]$/g, "")
            .split(",")
            .map((tag) => tag.trim().replace(/^["']|["']$/g, ""))
            .filter(Boolean);
        } else if (inline === "") {
          inTags = true;
        }
      }
      continue;
    }
    if (inTags) {
      const item = line.match(/^\s*-\s+(.*)$/);
      if (item) tags.push(item[1].trim().replace(/^["']|["']$/g, ""));
      else inTags = false;
    }
  }

  return { title, tags, body };
}

/** Host of a URL, without scheme, www, path or trailing slash. */
export function hostFromUrl(url) {
  const text = String(url ?? "").trim();
  if (!text) return "";
  try {
    return new URL(text.includes("://") ? text : `https://${text}`).host.replace(/^www\./, "");
  } catch {
    return "";
  }
}

// --- Inputs ----------------------------------------------------------------

export function readJsonFile(file) {
  return JSON.parse(readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
}

/** The catalog is either an array or `{ products: [...] }`. */
export function readCatalog(file) {
  const data = readJsonFile(file);
  const products = Array.isArray(data) ? data : data?.products;
  if (!Array.isArray(products)) throw new Error(`${file}: expected a products array`);
  return products;
}

/** `ewpa/get-tags` output: an array, or an envelope with `tags` / `data` / `items`. */
export function readWpTags(file) {
  const data = readJsonFile(file);
  const list = Array.isArray(data)
    ? data
    : (data?.tags ?? data?.data ?? data?.items ?? data?.result);
  if (!Array.isArray(list)) {
    throw new Error(`${file}: expected an array of tags or an object with a tags/data array`);
  }
  return list;
}

export async function fetchStoreProducts(baseUrl, { perPage = 100, maxPages = 10 } = {}) {
  const url = new URL(`${String(baseUrl).replace(/\/+$/, "")}/wp-json/wc/store/v1/products`);
  const items = [];

  for (let page = 1; page <= maxPages; page += 1) {
    url.searchParams.set("per_page", String(perPage));
    url.searchParams.set("page", String(page));

    let response;
    try {
      response = await fetch(url.toString(), { headers: { "User-Agent": "opencode-skills/1.0" } });
    } catch (error) {
      throw new Error(`store unreachable (${url.host}): ${error?.message ?? error}`);
    }
    if (!response.ok) throw new Error(`store ${url.host} -> HTTP ${response.status}`);

    const batch = await response.json();
    if (!Array.isArray(batch) || batch.length === 0) break;
    items.push(...batch);
    if (batch.length < perPage) break;
  }

  return items;
}

/** Download a product image; returns its bytes. */
export async function fetchImage(url) {
  let response;
  try {
    response = await fetch(url, { headers: { "User-Agent": "opencode-skills/1.0" } });
  } catch (error) {
    throw new Error(`image unreachable: ${error?.message ?? error}`);
  }
  if (!response.ok) throw new Error(`image HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}
