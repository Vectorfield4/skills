#!/usr/bin/env node
// shop-audit: what the articles tag and what the shop already carries.
//
// One pass, no per-article calls: posts+tags (or local article pairs) and every
// product including drafts, then the tag matrix and the gap list.
//
//   node scripts/audit.mjs [--host hello-robot.ru] [--offline --articles articles]
//                          [--catalog products/catalog.json] [--aliases data/<host>/tag-aliases.json]
//                          [--out data/<host>/audit.json]
//
// Exit 0 — audit written, 2 — workflow error.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { readArticle } from "#lib/product-match.mjs";
import { isEntryPoint } from "#lib/cli.mjs";
import { auditTags, buildAudit } from "#lib/sales/audit.mjs";
import { parseShop, runNode } from "#lib/sales/cli.mjs";
import { readJsonSafe, writeJson } from "#lib/sales/stable.mjs";
import { hasCredentials, resolveSite, wcProducts, wpPostsAll, wpTagsAll } from "#lib/sales/wc.mjs";

const USAGE = `Usage:
  audit.mjs [--host hello-robot.ru] [--offline --articles articles]
            [--catalog products/catalog.json] [--aliases data/<host>/tag-aliases.json]
            [--out data/<host>/audit.json]`;

function articleFiles(dir) {
  return readdirSync(dir)
    .filter((name) => name.endsWith(".ru.md"))
    .sort()
    .map((name) => join(dir, name));
}

function localTags(dir) {
  const files = articleFiles(dir);
  const tags = [];
  for (const file of files) {
    const parsed = readArticle(readFileSync(file, "utf8"));
    tags.push(...parsed.tags);
  }
  return { files, tags };
}

export async function run(argv = process.argv.slice(2)) {
  return runNode(async () => {
    const { flags, host, dir } = parseShop(argv, {
      offline: "boolean",
      articles: "string",
      catalog: "string",
      aliases: "string",
    });

    const out = flags.out ?? join(dir, "audit.json");
    const catalogFile = flags.catalog ?? "products/catalog.json";
    const aliasesFile = flags.aliases ?? join(dir, "tag-aliases.json");
    const aliases = readJsonSafe(aliasesFile, {});
    const catalog = readJsonSafe(catalogFile, null);
    const catalogProducts = Array.isArray(catalog) ? catalog : (catalog?.products ?? []);

    if (flags.offline) {
      const local = localTags(flags.articles ?? "articles");
      const tags = auditTags({ articleTags: local.tags, products: catalogProducts, aliases });
      const payload = {
        host,
        generated_at: new Date().toISOString(),
        source: "articles",
        catalog_file: catalogFile,
        aliases_file: aliasesFile,
        articles: local.files.length,
        tags,
        gaps: tags.filter((row) => !row.covered).map((row) => row.tag),
        known_tag_canons: tags.map((row) => row.canon).sort(),
        product_tag_canons: (() => {
          const audit = buildAudit({ products: catalogProducts, aliases, host });
          return audit.product_tag_canons;
        })(),
        products: catalogProducts
          .map((product) => ({
            sku: String(product?.sku ?? ""),
            name: String(product?.name ?? ""),
            status: String(product?.status ?? ""),
          }))
          .sort((a, b) => a.sku.localeCompare(b.sku)),
      };
      writeJson(out, payload);
      console.log(
        `${out}: ${payload.articles} статей, ${tags.length} тегов, ${payload.gaps.length} без товара (статьи)`,
      );
      for (const row of tags.filter((item) => !item.covered)) {
        console.log(`  нет  ${row.tag}  статей: ${row.articles}`);
      }
      return 0;
    }

    const site = resolveSite();
    const wpPosts = await wpPostsAll(site.url);
    const wpTags = await wpTagsAll(site.url);
    const termNames = new Map(wpTags.map((tag) => [Number(tag.id), String(tag.name)]));

    let products = catalogProducts;
    let source = "catalog";
    if (hasCredentials(site)) {
      try {
        products = await wcProducts(site, { status: "any" });
        source = "wc-rest (drafts included)";
      } catch (error) {
        console.warn(`WC REST недоступен, беру локальный каталог: ${error?.message ?? error}`);
      }
    }

    const audit = buildAudit({ posts: wpPosts, termNames, products, aliases, host });
    const payload = { ...audit, source, catalog_file: catalogFile, aliases_file: aliasesFile };
    writeJson(out, payload);
    console.log(
      `${out}: ${payload.articles} статей, ${payload.tags.length} тегов, ${payload.gaps.length} без товара (${source})`,
    );
    for (const row of payload.tags.filter((item) => !item.covered)) {
      console.log(`  нет  ${row.tag}  статей: ${row.articles}`);
    }
    return 0;
  });
}

if (isEntryPoint(import.meta.url)) run();
