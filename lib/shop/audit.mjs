// Article tags × products → coverage, gaps, and the shortlist driver.
//
// Tags are functional: a tag that articles use and no product carries is a gap,
// and a gap is the only reason a product is added to the catalog.

import {
  buildAliasIndex,
  canonicalTag,
  normalizeTag,
  tagNames,
} from "../product-match.mjs";

/** Product tag canons from any product shape (catalog, WC REST, Store API). */
export function productCanonTags(products, aliases = {}) {
  const index = buildAliasIndex(aliases);
  const rows = [];
  for (const product of products ?? []) {
    const canon = [
      ...new Set(
        tagNames(product?.tags)
          .map((tag) => canonicalTag(tag, index))
          .filter(Boolean),
      ),
    ];
    rows.push({ sku: String(product?.sku ?? ""), name: String(product?.name ?? ""), canon });
  }
  return rows;
}

/**
 * One row per tag the articles use: how many articles and how many products.
 * Rows are sorted by article count, then canonically, so the file is stable.
 */
export function auditTags({ articleTags = [], products = [], aliases = {} } = {}) {
  const index = buildAliasIndex(aliases);
  const counts = new Map();

  for (const tag of articleTags) {
    const canon = canonicalTag(tag, index);
    if (!canon) continue;
    const row = counts.get(canon) ?? { canon, tag: String(tag), articles: 0 };
    row.articles += 1;
    counts.set(canon, row);
  }

  const withProducts = new Set(productCanonTags(products, aliases).flatMap((row) => row.canon));

  return [...counts.values()]
    .map((row) => ({
      ...row,
      products: withProducts.has(row.canon) ? 1 : 0,
      covered: withProducts.has(row.canon),
    }))
    .sort((a, b) => b.articles - a.articles || a.canon.localeCompare(b.canon, "ru"));
}

export function gapsOf(tags) {
  return (tags ?? []).filter((row) => !row.covered).map((row) => row.tag);
}

/** Audit document written to `data/<host>/audit.json`. */
export function buildAudit({ posts = [], termNames = new Map(), products = [], aliases = {}, host = "" } = {}) {
  const articleTags = [];
  const articles = [];

  for (const post of posts) {
    const tags = (Array.isArray(post?.tags) ? post.tags : [])
      .map((id) => termNames.get(Number(id)))
      .filter(Boolean);
    articleTags.push(...tags);
    articles.push({ slug: String(post?.slug ?? ""), tags });
  }

  const tags = auditTags({ articleTags, products, aliases });
  const canonSet = new Set(tags.map((row) => row.canon));
  const known = new Set(productCanonTags(products, aliases).flatMap((row) => row.canon));

  return {
    host,
    generated_at: new Date().toISOString(),
    articles: articles.length,
    tags,
    gaps: gapsOf(tags),
    known_tag_canons: [...canonSet].sort(),
    product_tag_canons: [...known].sort(),
    products: (products ?? [])
      .map((product) => ({
        sku: String(product?.sku ?? ""),
        name: String(product?.name ?? ""),
        status: String(product?.status ?? ""),
        canon: productCanonTags([product], aliases)[0]?.canon ?? [],
      }))
      .sort((a, b) => a.sku.localeCompare(b.sku)),
  };
}

/** Tag list from local article pairs (frontmatter), for `--offline`. */
export function articleTagsFromFiles(articles, { readArticle, readFile }) {
  const tags = [];
  const files = [];
  for (const file of articles ?? []) {
    const parsed = readArticle(readFile(file));
    tags.push(...parsed.tags);
    files.push({ file, slug: String(file).split(/[\\/]/).pop().replace(/\.ru\.md$/, ""), tags: parsed.tags });
  }
  return { tags, files };
}

/** Re-checks coverage: the tag is covered when any product carries its canon. */
export function coverageFor(articleTags, products, aliases = {}) {
  const index = buildAliasIndex(aliases);
  const productCanons = new Set(
    productCanonTags(products, aliases).flatMap((row) => row.canon),
  );
  const rows = [...new Set((articleTags ?? []).map((tag) => canonicalTag(tag, index)).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "ru"))
    .map((canon) => ({
      canon,
      covered: productCanons.has(canon),
    }));
  return {
    rows,
    covered: rows.some((row) => row.covered),
    uncovered: rows.filter((row) => !row.covered).map((row) => row.canon),
  };
}

/** Normalized product name, used by the uniqueness gate. */
export function nameKey(name) {
  return normalizeTag(name);
}
