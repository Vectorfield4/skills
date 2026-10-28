// Brand-site harvesting: sitemap -> product page -> schema.org Product (or OG meta).
//
// No judgement here. The node returns facts (name, sku, price, image, category)
// and nothing else: choosing tags is `shop-tagmap`, choosing trust is
// `shop-gate`, and the price never leaves `data/`.

import { BROWSER_UA, fetchText } from "../http.mjs";
import { noteRequest } from "./metrics.mjs";
import { slugify, uniqueSorted } from "./stable.mjs";

const PRODUCT_TYPES = new Set(["Product", "ProductModel", "IndividualProduct"]);
// `product-1860.html` and `/goods/123` are product URLs too: a path segment
// followed by a separator is not required.
const PRODUCT_PATH = /\/(products?|p|shop|store|product-catalog|goods|item)(\/|[-_.]\d)/i;

/** `<loc>` values of a sitemap or sitemap index, sorted. */
export function parseSitemap(xml) {
  const text = String(xml ?? "");
  const locs = [...text.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((match) =>
    match[1].replace(/&amp;/g, "&").trim(),
  );
  const isIndex = /<sitemapindex[\s>]/i.test(text);
  return { locs: uniqueSorted(locs), isIndex };
}

/** Canonical brand domain: no scheme, no `www.`, no path. */
export function brandDomain(value) {
  return String(value ?? "")
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "")
    .toLowerCase();
}

/**
 * Sitemaps to try, most product-specific first: a brand often sells on a shop
 * subdomain while the marketing site has no product pages at all.
 */
export function candidateSitemaps(domain) {
  const base = brandDomain(domain);
  if (!base) return [];
  return uniqueSorted([
    `https://shop.${base}/sitemap.xml`,
    `https://${base}/sitemap.xml`,
    `https://www.${base}/sitemap.xml`,
  ]);
}

/** JSON-LD blocks of an HTML document, parsed and flattened. */
export function readJsonLd(html) {
  const blocks = [];
  const text = String(html ?? "");
  const pattern = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of text.matchAll(pattern)) {
    const raw = match[1].trim().replace(/^<!--/, "").replace(/-->$/, "");
    try {
      blocks.push(JSON.parse(raw));
    } catch {
      // A broken block is a fact about the page, not a reason to stop.
    }
  }
  return blocks;
}

function flatten(node, out = []) {
  if (Array.isArray(node)) {
    for (const item of node) flatten(item, out);
    return out;
  }
  if (!node || typeof node !== "object") return out;
  out.push(node);
  if (node["@graph"]) flatten(node["@graph"], out);
  if (node.itemListElement) flatten(node.itemListElement, out);
  return out;
}

function typeOf(node) {
  const type = node?.["@type"];
  return Array.isArray(type) ? type.map(String) : [String(type ?? "")];
}

function firstText(value) {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return firstText(value[0]);
  if (typeof value === "object") return firstText(value.name ?? value["@id"] ?? "");
  return String(value).trim();
}

function firstImage(value) {
  if (!value) return "";
  if (Array.isArray(value)) return firstImage(value[0]);
  if (typeof value === "string") return value.trim();
  return firstImage(value.url ?? value.contentUrl ?? "");
}

function offerOf(node) {
  const offers = Array.isArray(node?.offers) ? node.offers[0] : node?.offers;
  if (!offers || typeof offers !== "object") return {};
  const price = firstText(offers.price ?? offers.lowPrice ?? offers.highPrice);
  return {
    price: /^\d+(?:[.,]\d+)?$/.test(price) ? price.replace(",", ".") : "",
    currency: firstText(offers.priceCurrency),
    availability: firstText(offers.availability).replace(/^https?:\/\/schema\.org\//, ""),
  };
}

/** Deterministic sku: `HR-<BRAND>-<MODEL>`, unless the page already carries ours. */
export function makeSku({ sku, brand, name }) {
  const given = String(sku ?? "").trim().toUpperCase();
  if (given.startsWith("HR-")) return given;
  const brandSlug = slugify(brand);
  const nameSlug = slugify(name);
  const modelSlug =
    brandSlug && nameSlug.startsWith(`${brandSlug}-`) ? nameSlug.slice(brandSlug.length + 1) : nameSlug;
  const joined = [brandSlug.toUpperCase(), modelSlug.toUpperCase()].filter(Boolean).join("-").slice(0, 64);
  return joined ? `HR-${joined}` : "";
}

/** Basic HTML entities a brand page leaves in schema.org text. */
export function decodeEntities(text) {
  return String(text ?? "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–");
}

/** Brand label as a name we can match: "UnitreeRobotics" -> "Unitree". */
export function cleanBrand(brand, domain = "") {
  const raw = decodeEntities(String(brand ?? "").trim());
  const stripped = raw.replace(/\s*(robotics?|robot)\s*$/i, "").trim();
  if (stripped) return stripped;
  const root = brandDomain(domain).split(".")[0] ?? "";
  return root ? root.charAt(0).toUpperCase() + root.slice(1) : "";
}

function trimDescription(text) {
  const clean = decodeEntities(
    String(text ?? "")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
  return clean.length > 400 ? `${clean.slice(0, 397).trimEnd()}...` : clean;
}

/** A product page must name a product and show it: URLs and empty rows are noise. */
export function isPlausibleProduct(product) {
  const name = String(product?.name ?? "").trim();
  if (name.length < 2 || name.length > 90) return false;
  if (/^https?:\/\//i.test(name)) return false;
  if (!/[\p{L}]{2}/u.test(name)) return false;
  if (/^(store|shop|pages? archive|home|products?)$/i.test(name)) return false;
  if (!String(product?.image ?? "").trim()) return false;
  return true;
}

/** Product facts from JSON-LD. Returns null when the page has no Product node. */
export function productFromJsonLd(html, { url, domain }) {
  const blocks = readJsonLd(html);
  const node = flatten(blocks).find((item) => typeOf(item).some((type) => PRODUCT_TYPES.has(type)));
  if (!node) return null;

  const name = firstText(node.name);
  if (!name) return null;

  const brand = cleanBrand(firstText(node.brand) || firstText(node.manufacturer), domain);
  const offer = offerOf(node);
  const category = firstText(node.category);

  const product = {
    sku: makeSku({ sku: node.sku, brand: brand || domain, name }),
    name: decodeEntities(name),
    brand: brand || domain,
    domain: brandDomain(domain),
    url,
    price: offer.price,
    currency: offer.currency,
    availability: offer.availability,
    image: firstImage(node.image),
    category,
    description: trimDescription(node.description),
    evidence: "json-ld",
  };

  // A Product node with no commerce signal and no category is usually a
  // template page, not something we can sell.
  const commerce = product.price || product.availability || node.sku || category;
  return commerce ? product : null;
}/** OpenGraph/meta tags as a flat map (`og:title`, `product:price:amount`, …). */
export function readMeta(html) {
  const meta = {};
  const text = String(html ?? "");
  for (const match of text.matchAll(/<meta\s+[^>]*>/gi)) {
    const tag = match[0];
    const key = tag.match(/(?:property|name)=["']([^"']+)["']/i)?.[1]?.toLowerCase();
    const content = tag.match(/content=["']([^"']*)["']/i)?.[1];
    if (key && content !== undefined && meta[key] === undefined) meta[key] = content;
  }
  return meta;
}

/**
 * Fallback for shops without JSON-LD: OpenGraph product meta. A page is a
 * product only when it says so (`og:type=product`) — otherwise a blog post with
 * an image would become a robot.
 */
export function productFromOpenGraph(html, { url, domain }) {
  const meta = readMeta(html);
  // Only an explicit product page counts, and it must carry a commerce signal:
  // a marketing landing page with a pretty picture is not a product.
  if (String(meta["og:type"] ?? "").toLowerCase() !== "product") return null;
  const hasOffer = Boolean(meta["product:price:amount"] || meta["product:availability"]);
  if (!hasOffer) return null;

  const name = String(meta["og:title"] ?? "").trim();
  if (!name) return null;

  const brand = cleanBrand(String(meta["og:site_name"] ?? ""), domain);
  const price = String(meta["product:price:amount"] ?? "").replace(",", ".");

  return {
    sku: makeSku({ sku: "", brand, name }),
    name: decodeEntities(name),
    brand,
    domain: brandDomain(domain),
    url: String(meta["og:url"] ?? url),
    price: /^\d+(?:\.\d+)?$/.test(price) ? price : "",
    currency: String(meta["product:price:currency"] ?? ""),
    availability: "",
    image: String(meta["og:image:secure_url"] ?? meta["og:image"] ?? ""),
    category: "",
    description: trimDescription(meta["og:description"] ?? meta["description"] ?? ""),
    evidence: "open-graph",
  };
}

/**
 * One entry of a Shopify `/products.json` feed: the whole catalogue in a single
 * request, with `vendor`, `product_type`, images and the first variant's sku and
 * price. No page parsing, so a Shopify brand cannot be lost to a WAF or a 429.
 */
export function productFromShopify(node, domain) {
  const base = brandDomain(domain);
  const name = String(node?.title ?? "").trim();
  if (!name) return null;
  const variants = Array.isArray(node?.variants) ? node.variants : [];
  const variant = variants[0] ?? {};
  // Shopify `vendor` is often the platform an educational kit is built on
  // ("Arduino", "Raspberry Pi"), not the shop brand. Keep it only when it names
  // the domain itself; otherwise the domain root is the sellable brand.
  const root = base.split(".")[0] ?? "";
  const vendor = cleanBrand(node?.vendor, base);
  const brand = vendor && vendor.toLowerCase().includes(root.toLowerCase()) ? vendor : cleanBrand("", base);
  const price = String(variant?.price ?? "").replace(",", ".");
  return {
    sku: makeSku({ sku: variant?.sku, brand, name }),
    name: decodeEntities(name),
    brand: brand || base,
    domain: base,
    url: node?.handle ? `https://${base}/products/${node.handle}` : `https://${base}`,
    price: /^\d+(?:\.\d+)?$/.test(price) ? price : "",
    currency: "",
    availability: "",
    image: String(node?.images?.[0]?.src ?? variant?.featured_image?.src ?? ""),
    category: decodeEntities(String(node?.product_type ?? "")),
    description: trimDescription(node?.body_html),
    evidence: "shopify-products-json",
  };
}

/**
 * A saved Shopify `/products.json` feed -> the same index shape. Used when the
 * feed is downloaded outside Node (curl, a browser session): the facts are the
 * same, only the transport differs.
 */
export function harvestFeed(raw, domain) {
  const base = brandDomain(domain);
  if (!base) throw new Error("harvestFeed needs a domain");
  const parsed = JSON.parse(String(raw ?? ""));
  const list = Array.isArray(parsed?.products) ? parsed.products : Array.isArray(parsed) ? parsed : [];
  const products = list.map((node) => productFromShopify(node, base)).filter(Boolean).filter(isPlausibleProduct);
  return {
    domain: base,
    sitemap: "",
    fetched_at: new Date().toISOString(),
    products: dedupeProducts(products),
    warnings: [],
  };
}

/** JSON-LD first, OpenGraph second. Null when the page carries no usable product. */
export function productFromHtml(html, context) {
  const product = productFromJsonLd(html, context) ?? productFromOpenGraph(html, context);
  return product && isPlausibleProduct(product) ? product : null;
}

/** Product-like URLs of a sitemap: product paths first, sorted, capped. */
export function productUrls(locs, { limit = 40 } = {}) {
  const skip = /\/(blog|news|support|about|contact|careers|press|legal|privacy|terms|cart|checkout|account|search|collections)(\/|$)/i;
  const usable = uniqueSorted((locs ?? []).filter((url) => !skip.test(url)));
  const preferred = usable.filter((url) => PRODUCT_PATH.test(url));
  const rest = usable.filter((url) => !PRODUCT_PATH.test(url));
  return [...preferred, ...rest].slice(0, Math.max(0, limit));
}

function mergeSitemapLocs(docs) {
  const locs = [];
  for (const doc of docs) locs.push(...doc.locs);
  return uniqueSorted(locs);
}

/** One row per sku; a repeated model is one product, not two. */
function dedupeProducts(products) {
  const bySku = new Map();
  for (const product of products) {
    const key = product.sku || slugify(`${product.brand}-${product.name}`).toUpperCase();
    if (!bySku.has(key)) bySku.set(key, { ...product, sku: key });
  }
  return [...bySku.values()].sort((a, b) => a.sku.localeCompare(b.sku));
}

/**
 * Harvests one domain. Without an explicit `sitemapUrl` the shop subdomain is
 * tried first, then the bare domain. Every fetch failure is a warning, never a
 * stop: a marketing site that blocks us simply yields no products.
 */
export async function harvestDomain({
  domain,
  sitemapUrl = "",
  limit = 40,
  fetch = fetchText,
  delayMs = 0,
} = {}) {
  const base = brandDomain(domain);
  if (!base) throw new Error("harvest needs a domain");
  const warnings = [];
  const products = [];
  const visited = new Set();

  async function read(url) {
    noteRequest(url);
    try {
      return await fetch(url, { userAgent: "opencode-skills/1.0" });
    } catch (error) {
      warnings.push(`${url}: ${error?.message ?? error}`);
      return "";
    }
  }

  // A Shopify store answers its whole catalogue from one endpoint, so try that
  // before walking a sitemap. A non-Shopify site simply fails the probe and the
  // sitemap path below runs as usual.
  const shopifyUrl = `https://${base}/products.json?limit=250`;
  // Shopify's edge rate-limits a bot-looking UA and answers a 429 with HTML, so
  // the probe uses a browser UA and retries: one good answer is the whole
  // catalogue, and a transient 429 must not wipe a healthy index.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      noteRequest(shopifyUrl);
      const raw = await fetch(shopifyUrl, { userAgent: BROWSER_UA, timeoutMs: 30000 });
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed?.products) && parsed.products.length > 0) {
        const mapped = parsed.products
          .map((node) => productFromShopify(node, base))
          .filter(Boolean)
          .filter(isPlausibleProduct);
        if (mapped.length > 0) {
          return {
            domain: base,
            sitemap: shopifyUrl,
            fetched_at: new Date().toISOString(),
            products: dedupeProducts(mapped),
            warnings,
          };
        }
      }
      break;
    } catch {
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 2000 * (attempt + 1)));
    }
  }

  const candidates = sitemapUrl ? [sitemapUrl] : candidateSitemaps(base);
  let sitemap = "";
  let locs = [];

  for (const candidate of candidates) {
    const xml = await read(candidate);
    if (!xml) continue;
    const parsed = parseSitemap(xml);
    if (parsed.locs.length === 0) continue;
    sitemap = candidate;
    locs = parsed.locs;

    if (parsed.isIndex) {
      const xmlChildren = locs.filter((url) => /\.xml(?:\.gz)?(?:$|\?)/i.test(url));
      const productFirst = xmlChildren.filter((url) => /products?/i.test(url));
      const children = [...productFirst, ...xmlChildren.filter((url) => !productFirst.includes(url))].slice(
        0,
        6,
      );
      const docs = [];
      for (const child of children) {
        if (visited.has(child)) continue;
        visited.add(child);
        docs.push(parseSitemap(await read(child)));
      }
      locs = mergeSitemapLocs(docs);
    }
    break;
  }

  for (const url of productUrls(locs, { limit })) {
    if (visited.has(url)) continue;
    visited.add(url);
    const html = await read(url);
    if (!html) continue;
    const product = productFromHtml(html, { url, domain: base });
    if (product) products.push(product);
    if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  return {
    domain: base,
    sitemap,
    fetched_at: new Date().toISOString(),
    products: dedupeProducts(products),
    warnings,
  };
}
