// Three independent verdicts, each a pure function of facts.
//
// publish = trusted brand AND unique product AND enough spec to show the robot.
// Price is deliberately absent: it is never published, so it cannot block.

import { normalizeTag } from "../product-match.mjs";
import { isTrusted, sellerIndex } from "./plan.mjs";

export function trustVerdict(product, sellers = []) {
  const trusted = isTrusted(product, sellerIndex(sellers));
  return { ok: trusted, reason: trusted ? "brand in allowlist" : "brand is not in data/<host>/sellers.yaml" };
}

function modelTokens(name) {
  return normalizeTag(name)
    .split(" ")
    .filter((token) => token.length >= 2);
}

/**
 * Unique against everything the site already has, drafts included: same sku,
 * same normalized name, or two shared name tokens ("Unitree G1" vs "Unitree G1
 * Pro" — brand plus model, whether or not the brand field arrived).
 */
export function uniqueVerdict(product, existing = []) {
  const sku = String(product?.sku ?? "").trim().toUpperCase();
  const name = normalizeTag(product?.name ?? "");
  const tokens = new Set(modelTokens(product?.name ?? ""));

  for (const item of existing ?? []) {
    const otherSku = String(item?.sku ?? "").trim().toUpperCase();
    // The same sku is this product, not a duplicate: enriching an existing
    // catalog entry must not fail its own uniqueness check.
    if (sku && otherSku && sku === otherSku) continue;
    if (name && otherName(item) && name === otherName(item)) {
      return { ok: false, reason: `name "${product?.name}" already exists on the site` };
    }
    const shared = modelTokens(item?.name ?? "").filter((token) => tokens.has(token));
    if (shared.length >= 2) {
      return { ok: false, reason: `model tokens "${shared.join(" ")}" already exist on the site` };
    }
  }
  return { ok: true, reason: "no sku or name collision" };
}

function otherName(item) {
  return normalizeTag(item?.name ?? "");
}

/** Enough to render a product page: an image and at least one fact. */
export function specVerdict(product) {
  const image = String(product?.image ?? "").trim();
  const category = String(product?.category ?? "").trim();
  const description = String(product?.description ?? "").trim();
  if (!image) return { ok: false, reason: "no product image" };
  if (!category && description.length < 80) {
    return { ok: false, reason: "no description or category to show" };
  }
  return { ok: true, reason: "image and description present" };
}

/** All three verdicts for one candidate; publish only when all pass. */
export function gateProduct(product, { sellers = [], existing = [] } = {}) {
  const trust = trustVerdict(product, sellers);
  const unique = uniqueVerdict(product, existing);
  const spec = specVerdict(product);
  const ok = trust.ok && unique.ok && spec.ok;
  return {
    sku: product.sku,
    name: product.name,
    verdict: ok ? "publish" : "draft",
    reasons: [trust, unique, spec].filter((item) => !item.ok).map((item) => item.reason),
    trust: trust.ok,
    unique: unique.ok,
    spec: spec.ok,
    tags: product.tags ?? [],
    types: product.types ?? [],
    brand: product.brand ?? "",
    image: product.image ?? "",
    url: product.url ?? "",
    category: product.category ?? "",
    description: product.description ?? "",
    availability: product.availability ?? "",
  };
}

export function gateAll({ candidates = [], sellers = [], existing = [] } = {}) {
  return (candidates ?? [])
    .map((product) => gateProduct(product, { sellers, existing }))
    .sort((a, b) => String(a.sku).localeCompare(String(b.sku)));
}
