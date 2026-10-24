// The only place a WooCommerce product payload is built.
//
// Invariant: a price collected on a brand site lives in `data/<host>/prices.yaml`
// and never reaches WordPress. The builder therefore has no price input at all:
// `regular_price` is a constant sentinel `"0"`, which keeps
// `is_purchasable = true` so the "Заказать" form stays available, and the site
// never renders a price (the number is given on the phone).

export const PRICE_SENTINEL = "0";
export const STOCK_DEFAULT = "onbackorder";

/** Fields a catalog entry may carry. Anything else is ignored on purpose. */
const ALLOWED = new Set([
  "sku",
  "name",
  "slug",
  "type",
  "status",
  "stock_status",
  "manage_stock",
  "short_description",
  "description",
  "categories",
  "tags",
  "images",
  "source_url",
]);

/** Fields that must never appear in a payload sent to WooCommerce. */
export const FORBIDDEN_FIELDS = ["price", "regular_price", "sale_price", "prices", "cost"];

function names(list) {
  return (Array.isArray(list) ? list : [])
    .map((item) => (typeof item === "string" ? item : item?.name))
    .map((name) => String(name ?? "").trim())
    .filter(Boolean);
}

export function unknownFields(product) {
  return Object.keys(product ?? {}).filter((key) => !ALLOWED.has(key) && !FORBIDDEN_FIELDS.includes(key));
}

/** `publish` only when the gate said so; everything else stays a draft. */
export function resolveStatus(productStatus) {
  return productStatus === "publish" ? "publish" : "draft";
}

/**
 * WC REST payload. Whitelisted: no price key is copied from the product, the
 * sentinel is set by this function. Tags and categories go as `[{ name }]`;
 * images as `[{ src }]` — WooCommerce downloads them itself.
 */
export function buildWcPayload(product, { existingStatus } = {}) {
  const payload = {
    name: String(product?.name ?? "").trim(),
    type: "simple",
    sku: String(product?.sku ?? "").trim(),
    status: existingStatus === "publish" ? "publish" : resolveStatus(product?.status),
    regular_price: PRICE_SENTINEL,
    stock_status: String(product?.stock_status ?? STOCK_DEFAULT),
    manage_stock: false,
    short_description: String(product?.short_description ?? ""),
    description: String(product?.description ?? ""),
    categories: names(product?.categories).map((name) => ({ name })),
    tags: names(product?.tags).map((name) => ({ name })),
    images: (Array.isArray(product?.images) ? product.images : [])
      .map((image) => (typeof image === "string" ? image : image?.src))
      .map((src) => String(src ?? "").trim())
      .filter(Boolean)
      .map((src) => ({ src })),
  };
  if (product?.slug) payload.slug = String(product.slug);
  return payload;
}

/** A payload the shop refuses to send: price leaked, sku or name missing. */
export function validatePayload(payload) {
  const problems = [];
  for (const field of FORBIDDEN_FIELDS) {
    if (field in payload && field !== "regular_price") problems.push(`forbidden field ${field}`);
  }
  if (payload.regular_price !== PRICE_SENTINEL) {
    problems.push(`regular_price must be the sentinel ${PRICE_SENTINEL}, got ${payload.regular_price}`);
  }
  if (!payload.name) problems.push("name is empty");
  if (!payload.sku) problems.push("sku is empty");
  return problems;
}

/** MCP `woocommerce/product-create` input: the same fields the ability accepts. */
export function buildWpCreateInput(product) {
  return {
    product_type_alias: "physical",
    name: String(product?.name ?? "").trim(),
    sku: String(product?.sku ?? "").trim(),
    regular_price: PRICE_SENTINEL,
    status: "draft",
    stock_status: String(product?.stock_status ?? STOCK_DEFAULT),
    short_description: String(product?.short_description ?? ""),
    description: String(product?.description ?? ""),
  };
}

/** Term names for `ewpa/assign-cpt-terms`, deduplicated. */
export function termNames(list) {
  return [...new Set(names(list))].sort((a, b) => a.localeCompare(b, "ru"));
}

/** First image URL, or "" — the WP skill uploads exactly one product image. */
export function primaryImage(product) {
  const first = (Array.isArray(product?.images) ? product.images : [])[0];
  const src = typeof first === "string" ? first : first?.src;
  return String(src ?? "").trim();
}
