#!/usr/bin/env node
// shop-write/wp-payload: the exact MCP calls for the WordPress-skill transport.
//
// The `woocommerce/product-create` ability has no `tags`, `categories` or
// `images` fields, so one product is four calls: create, terms, image, publish.
// This node builds the arguments; the agent executes them in order.
//
//   node scripts/write-wp-payload.mjs --catalog products/catalog.json --gated data/<host>/gated.json
//                                     [--only HR-...] [--out data/<host>/wp-plan.json]
//
// Exit 0 — plan written, 1 — nothing to write, 2 — workflow error.

import { isEntryPoint } from "#lib/cli.mjs";
import { parseShop, runNode } from "#lib/sales/cli.mjs";
import { buildWpCreateInput, primaryImage, termNames } from "#lib/sales/payload.mjs";
import { readJsonSafe, writeJson } from "#lib/sales/stable.mjs";
import { checkTranslation, formatBlocked } from "#lib/sales/translation.mjs";

const USAGE = `Usage:
  write-wp-payload.mjs --catalog products/catalog.json --gated data/<host>/gated.json
                       [--only HR-...] [--out data/<host>/wp-plan.json] [--skip-translation]`;

export async function run(argv = process.argv.slice(2)) {
  return runNode(async () => {
    const { flags, host, dir } = parseShop(argv, {
      catalog: "string",
      gated: "string",
      only: "string",
      "skip-translation": "boolean",
    });

    const catalog = readJsonSafe(flags.catalog ?? "products/catalog.json", null);
    if (!flags.gated) throw new Error("write-wp-payload needs --gated data/<host>/gated.json");
    const gated = readJsonSafe(flags.gated, null);
    const products = Array.isArray(catalog) ? catalog : (catalog?.products ?? []);
    const allowed = new Set((gated?.items ?? []).map((item) => String(item.sku)));
    const only = flags.only ? new Set(flags.only.split(",").map((sku) => sku.trim())) : null;

    const targets = products.filter(
      (product) => allowed.has(String(product.sku)) && (!only || only.has(String(product.sku))),
    );

    // A Russian-only shop must not receive a raw English/Chinese card.
    if (!flags["skip-translation"]) {
      const translation = await checkTranslation({ products: targets, file: flags.catalog ?? "products/catalog.json" });
      if (!translation.ok) {
        console.error("непереведённый текст: план остановлен");
        console.error(formatBlocked(translation));
        return 1;
      }
      if (translation.skipped === "no-key") {
        console.log("translation: Jev пропущен (no-key), детерминированный fallback чист");
      }
    }

    const items = targets
      .map((product) => ({
        sku: product.sku,
        name: product.name,
        status: product.status === "publish" ? "publish" : "draft",
        steps: [
          { order: 1, ability: "woocommerce/product-create", input: buildWpCreateInput(product) },
          {
            order: 2,
            ability: "ewpa/assign-cpt-terms",
            input: {
              product_id: "<id из шага 1>",
              taxonomy: "product_tag",
              terms: termNames(product.tags),
              append: false,
            },
          },
          {
            order: 3,
            ability: "ewpa/assign-cpt-terms",
            input: {
              product_id: "<id из шага 1>",
              taxonomy: "product_cat",
              terms: termNames(product.categories),
              append: true,
            },
          },
          {
            order: 4,
            ability: "ewpa/upload-image",
            input: {
              url: primaryImage(product),
              alt_text: product.name,
              post_id: "<id из шага 1>",
            },
            skip: !primaryImage(product),
          },
          {
            order: 5,
            ability: "woocommerce/product-update",
            input: { id: "<id из шага 1>", status: product.status === "publish" ? "publish" : "draft" },
          },
        ],
      }));

    const out = flags.out ?? `${dir}/wp-plan.json`;
    writeJson(out, {
      host,
      generated_at: new Date().toISOString(),
      note: "product-create не умеет tags/categories/images: один товар — пять вызовов по порядку",
      items,
    });

    console.log(`${out}: ${items.length} товар(ов) для WordPress-скила`);
    for (const item of items) {
      console.log(`  ${item.sku}  ${item.status}  теги: ${termNames(item.steps[1].input.terms).join("/") || "-"}`);
    }
    return items.length > 0 ? 0 : 1;
  });
}

if (isEntryPoint(import.meta.url)) run();
