// Candidates for a gap: tag first, brand second, premium third.
//
// Integer scoring only, tie-break by sku, so the same inputs always produce the
// same queue. A product without a tag that the blog already uses never enters.

import { normalizeTag } from "../product-match.mjs";

export const WEIGHT = {
  tagMatch: 3,
  tagMatchCap: 2,
  trustedBrand: 2,
  premiumMax: 2,
  image: 1,
  spec: 1,
};

export function sellerIndex(sellers = []) {
  const map = new Map();
  for (const seller of sellers ?? []) {
    const name = normalizeTag(seller?.name ?? "");
    if (name) map.set(name, seller);
    const domain = String(seller?.domain ?? "")
      .replace(/^www\./, "")
      .toLowerCase();
    if (domain) map.set(`domain:${domain}`, seller);
  }
  return map;
}

export function isTrusted(product, index) {
  const brand = normalizeTag(product?.brand ?? "");
  const domain = String(product?.domain ?? "")
    .replace(/^www\./, "")
    .toLowerCase();
  return Boolean(index.get(brand) || (domain && index.get(`domain:${domain}`)));
}

/** Price percentile inside the brand: 2 = top quartile, 1 = above median, 0 = rest. */
export function premiumScores(products) {
  const byBrand = new Map();
  for (const product of products ?? []) {
    const key = normalizeTag(product?.brand ?? product?.domain ?? "");
    const price = Number(String(product?.price ?? "").replace(",", "."));
    if (!key || !Number.isFinite(price) || price <= 0) continue;
    const list = byBrand.get(key) ?? [];
    list.push(price);
    byBrand.set(key, list);
  }
  for (const list of byBrand.values()) list.sort((a, b) => a - b);

  const scores = new Map();
  for (const product of products ?? []) {
    const key = normalizeTag(product?.brand ?? product?.domain ?? "");
    const price = Number(String(product?.price ?? "").replace(",", "."));
    const list = byBrand.get(key) ?? [];
    if (!key || !Number.isFinite(price) || list.length === 0) continue;
    // Share of the brand's models at or below this price: duplicates cannot
    // collapse the top quartile, which `indexOf` did.
    const below = list.filter((value) => value <= price).length;
    const share = list.length === 1 ? 1 : below / list.length;
    scores.set(product.sku, share > 0.75 ? 2 : share > 0.5 ? 1 : 0);
  }
  return scores;
}

function hasSpec(product) {
  return Boolean(product?.image) && (String(product?.description ?? "").length >= 80 || Boolean(product?.category));
}

/**
 * Existing catalog entries that the index can enrich: a product without an
 * image or a description is a draft that already exists, not a new candidate.
 * Matching is by sku first, then by normalized name.
 */
export function findUpdates({ catalog = [], tagged = {} } = {}) {
  const bySku = new Map((tagged?.products ?? []).map((product) => [String(product.sku).toUpperCase(), product]));
  const byName = new Map((tagged?.products ?? []).map((product) => [normalizeTag(product.name), product]));
  const updates = [];

  for (const entry of catalog ?? []) {
    const sku = String(entry?.sku ?? "").trim();
    const needsImage = !(Array.isArray(entry?.images) ? entry.images.length : 0);
    const needsText = !String(entry?.description ?? "").trim();
    const short = String(entry?.short_description ?? "").trim();
    // A brand's English marketing line is not a Russian short description.
    const needsRussian = !short || (!/[а-яё]/i.test(short) && short.split(/\s+/).length >= 2);
    if (!sku || (!needsImage && !needsText && !needsRussian)) continue;

    const match = bySku.get(sku.toUpperCase()) ?? byName.get(normalizeTag(entry?.name ?? ""));
    if (!match) continue;

    updates.push({
      ...match,
      sku,
      name: String(entry?.name ?? match.name),
      tags: [...new Set([...(productTags(entry) ?? []), ...(match.tags ?? [])])].sort((a, b) =>
        a.localeCompare(b, "ru"),
      ),
      isUpdate: true,
      fromIndex: match.sku,
    });
  }

  return updates.sort((a, b) => String(a.sku).localeCompare(String(b.sku)));
}

function productTags(product) {
  return (Array.isArray(product?.tags) ? product.tags : [])
    .map((tag) => (typeof tag === "string" ? tag : tag?.name))
    .filter(Boolean);
}

/**
 * Ranks candidates for every gap tag and adds the premium queue for tags that
 * already have a product but lack a flagship.
 */
export function buildPlan({
  audit,
  tagged,
  sellers = [],
  catalog = [],
  limitPerTag = 3,
  premiumPerTag = 1,
  host = "",
} = {}) {
  const siteCanons = new Set(audit?.known_tag_canons ?? []);
  const existingSkus = new Set((audit?.products ?? []).map((item) => String(item.sku)));
  const existingNames = new Set((audit?.products ?? []).map((item) => normalizeTag(item.name)));
  const sellersByKey = sellerIndex(sellers);
  const premium = premiumScores(tagged?.products ?? []);
  const candidates = (tagged?.products ?? []).filter(
    (product) =>
      product.sku &&
      !existingSkus.has(String(product.sku)) &&
      !existingNames.has(normalizeTag(product.name)) &&
      (product.tags ?? []).some((tag) => siteCanons.has(tag)),
  );

  function scoreOf(product, gapTag) {
    const matched = (product.tags ?? []).filter((tag) => (gapTag ? tag === gapTag : siteCanons.has(tag)));
    const tags = Math.min(matched.length, WEIGHT.tagMatchCap) * WEIGHT.tagMatch;
    const trusted = isTrusted(product, sellersByKey) ? WEIGHT.trustedBrand : 0;
    const premiumScore = premium.get(product.sku) ?? 0;
    return {
      score: tags + trusted + premiumScore + (product.image ? WEIGHT.image : 0) + (hasSpec(product) ? WEIGHT.spec : 0),
      tagScore: tags,
      trusted,
      premium: premiumScore,
      matched,
    };
  }

  const queue = [];
  const gaps = new Set(audit?.gaps ?? []);

  for (const row of audit?.tags ?? []) {
    const isGap = gaps.has(row.tag) || gaps.has(row.canon);
    const pool = candidates.filter((product) => (product.tags ?? []).includes(row.canon));
    if (pool.length === 0) continue;

    const ranked = pool
      .map((product) => ({ product, ...scoreOf(product, row.canon) }))
      .sort((a, b) => b.score - a.score || String(a.product.sku).localeCompare(String(b.product.sku)));

    if (isGap) {
      queue.push({
        tag: row.canon,
        reason: "gap",
        articles: row.articles,
        candidates: ranked.slice(0, Math.max(0, limitPerTag)).map((entry) => ({
          sku: entry.product.sku,
          name: entry.product.name,
          brand: entry.product.brand,
          score: entry.score,
          matched: entry.matched,
          trusted: Boolean(entry.trusted),
          premium: entry.premium,
          image: entry.product.image,
          price: entry.product.price,
          currency: entry.product.currency,
          url: entry.product.url,
          category: entry.product.category,
          types: entry.product.types ?? [],
          description: entry.product.description,
          availability: entry.product.availability,
          domain: entry.product.domain,
        })),
      });
      continue;
    }

    const flagship = ranked.filter((entry) => entry.premium >= 2).slice(0, Math.max(0, premiumPerTag));
    if (flagship.length > 0) {
      queue.push({
        tag: row.canon,
        reason: "premium",
        articles: row.articles,
        candidates: flagship.map((entry) => ({
          sku: entry.product.sku,
          name: entry.product.name,
          brand: entry.product.brand,
          score: entry.score,
          matched: entry.matched,
          trusted: Boolean(entry.trusted),
          premium: entry.premium,
          image: entry.product.image,
          price: entry.product.price,
          currency: entry.product.currency,
          url: entry.product.url,
          category: entry.product.category,
          types: entry.product.types ?? [],
          description: entry.product.description,
          availability: entry.product.availability,
          domain: entry.product.domain,
        })),
      });
    }
  }

  queue.sort((a, b) => (a.reason === b.reason ? a.tag.localeCompare(b.tag, "ru") : a.reason === "gap" ? -1 : 1));

  const updates = findUpdates({ catalog, tagged });

  return {
    host,
    generated_at: new Date().toISOString(),
    site_tags: [...siteCanons].sort(),
    stats: {
      candidates: candidates.length,
      gaps: gaps.size,
      mapped: (tagged?.products ?? []).length,
      unmapped: (tagged?.unmapped ?? []).length,
      skipped: (tagged?.skipped ?? []).length,
      updates: updates.length,
    },
    updates,
    queue,
  };
}

/** Every candidate the plan proposes: enrichments first, then new products, by sku. */
export function plannedCandidates(plan) {
  const bySku = new Map();
  for (const item of plan?.updates ?? []) {
    bySku.set(item.sku, { ...item });
  }
  for (const row of plan?.queue ?? []) {
    for (const candidate of row.candidates ?? []) {
      const existing = bySku.get(candidate.sku);
      if (!existing) bySku.set(candidate.sku, { ...candidate, tags: [row.tag] });
      else if (!existing.tags.includes(row.tag)) existing.tags.push(row.tag);
    }
  }
  return [...bySku.values()].sort((a, b) => String(a.sku).localeCompare(String(b.sku)));
}
