// Verify: the product is visible to the Store API and its tags survived.
//
// Publishing is not the same as being on the site: only a `publish` product
// reaches the Store API, and a product without tags never appears under an
// article. Both facts are checked here, not assumed.

import { buildAliasIndex, canonicalTag, tagNames } from "../product-match.mjs";

/** Store API product -> the few facts verify needs. */
export function storeView(product) {
  return {
    sku: String(product?.sku ?? ""),
    name: String(product?.name ?? ""),
    id: product?.id ?? null,
    tags: tagNames(product?.tags),
    images: Array.isArray(product?.images) ? product.images.length : 0,
  };
}

/**
 * `expected` = [{ sku, tags }] from the gate. A row is ok when the sku is on the
 * Store API, carries every expected canonical tag and has at least one image.
 */
export function verifyStore({ expected = [], products = [], aliases = {} } = {}) {
  const index = buildAliasIndex(aliases);
  const live = new Map((products ?? []).map((product) => [String(product?.sku ?? ""), storeView(product)]));
  const rows = [];

  for (const item of expected ?? []) {
    const sku = String(item?.sku ?? "");
    const found = live.get(sku) ?? null;
    const wanted = [...new Set((item?.tags ?? []).map((tag) => canonicalTag(tag, index)).filter(Boolean))];
    const actual = new Set((found?.tags ?? []).map((tag) => canonicalTag(tag, index)));
    const missing = wanted.filter((tag) => !actual.has(tag));
    const problems = [];
    if (!found) problems.push("not on the Store API (draft or missing)");
    if (found && missing.length > 0) problems.push(`tags not applied: ${missing.join(", ")}`);
    if (found && found.images === 0) problems.push("no image on the product");

    rows.push({
      sku,
      visible: Boolean(found),
      id: found?.id ?? null,
      tags: found?.tags ?? [],
      missingTags: missing,
      images: found?.images ?? 0,
      ok: problems.length === 0,
      problems,
    });
  }

  return {
    rows: rows.sort((a, b) => a.sku.localeCompare(b.sku)),
    ok: rows.length > 0 && rows.every((row) => row.ok),
    okCount: rows.filter((row) => row.ok).length,
  };
}
