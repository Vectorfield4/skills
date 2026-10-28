#!/usr/bin/env node
// shop-write/translation: block a product batch that still carries untranslated
// text. The site is Russian-only, so a raw English/Chinese card must not reach
// WooCommerce.
//
//   node scripts/check-translation.mjs --catalog products/catalog.json \
//     --gated data/<host>/gated.json [--only HR-...] [--json]
//
// Exit 0 — clean (or no text to check), 1 — untranslated text found, 2 — error.

import { isEntryPoint } from "#lib/cli.mjs";
import { parseShop, runNode } from "#lib/sales/cli.mjs";
import { readJsonSafe } from "#lib/sales/stable.mjs";
import { checkTranslation, formatBlocked } from "#lib/sales/translation.mjs";

const USAGE = `Usage:
  check-translation.mjs --catalog products/catalog.json --gated data/<host>/gated.json
                        [--only HR-...] [--json]`;

/** Catalog entries the gate approved, same selection as the two write nodes. */
export function selectTargets(catalog, gated, only) {
  const products = Array.isArray(catalog) ? catalog : (catalog?.products ?? []);
  const allowed = new Set((gated?.items ?? []).map((item) => String(item.sku)));
  return products.filter(
    (product) => allowed.has(String(product.sku)) && (!only || only.has(String(product.sku))),
  );
}

export async function run(argv = process.argv.slice(2)) {
  return runNode(async () => {
    const { flags } = parseShop(argv, {
      catalog: "string",
      gated: "string",
      only: "string",
      json: "boolean",
    });

    if (!flags.gated) throw new Error("check-translation needs --gated data/<host>/gated.json");
    const catalog = readJsonSafe(flags.catalog ?? "products/catalog.json", null);
    const gated = readJsonSafe(flags.gated, null);
    const only = flags.only ? new Set(flags.only.split(",").map((sku) => sku.trim())) : null;
    const targets = selectTargets(catalog, gated, only);

    if (targets.length === 0) {
      console.log("перевод: проверять нечего — в каталоге нет товаров, одобренных гейтом");
      return 0;
    }

    const result = await checkTranslation({ products: targets });

    if (flags.json) {
      console.log(JSON.stringify(result.report ?? { skipped: result.skipped, findings: result.findings }, null, 2));
    } else if (result.skipped === "no-key") {
      console.log(
        `Jev: пропущено (no-key) — проверен только детерминированный fallback, находок ${result.findings.length}.`,
      );
      if (result.findings.length > 0) console.log(formatBlocked(result));
    } else if (result.ok) {
      console.log(`перевод: чисто, ${targets.length} товар(ов)`);
      const advisories = (result.findings ?? []).filter((f) => f.severity === "advisory");
      if (advisories.length) {
        console.log(`  предупреждения (серая зона, не блокируют): ${advisories.length}`);
        for (const f of advisories) console.log(`    [${f.line}] ${f.detail}`);
      }
    } else {
      console.log(`перевод: найден непереведённый текст — запись остановлена`);
      console.log(formatBlocked(result));
    }

    return result.ok ? 0 : 1;
  });
}

if (isEntryPoint(import.meta.url)) run();
