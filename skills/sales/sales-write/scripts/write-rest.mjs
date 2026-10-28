#!/usr/bin/env node
// shop-write/rest: WooCommerce REST batch upsert, one request for the whole run.
//
// Reads only what the gate approved: a catalog entry without a gated item is
// never sent. The payload comes from `lib/shop/payload.mjs`, which cannot carry
// a price.
//
//   node scripts/write-rest.mjs --catalog products/catalog.json --gated data/<host>/gated.json
//                               [--only HR-UNITREE-G1,HR-UNITREE-GO2] [--dry-run]
//
// Exit 0 — every product saved, 1 — some failed, 2 — workflow error.

import { isEntryPoint } from "#lib/cli.mjs";
import { parseShop, runNode } from "#lib/sales/cli.mjs";
import { buildWcPayload, validatePayload } from "#lib/sales/payload.mjs";
import { readJsonSafe } from "#lib/sales/stable.mjs";
import { checkTranslation, formatBlocked } from "#lib/sales/translation.mjs";
import { hasCredentials, resolveSite, ShopError, wcBatch, wcFindBySku } from "#lib/sales/wc.mjs";

const USAGE = `Usage:
  write-rest.mjs --catalog products/catalog.json --gated data/<host>/gated.json
                 [--only HR-UNITREE-G1,HR-UNITREE-GO2] [--dry-run] [--skip-translation]`;

export async function run(argv = process.argv.slice(2)) {
  return runNode(async () => {
    const { flags } = parseShop(argv, {
      catalog: "string",
      gated: "string",
      only: "string",
      "dry-run": "boolean",
      "skip-translation": "boolean",
    });

    const catalogFile = flags.catalog ?? "products/catalog.json";
    if (!flags.gated) throw new Error("write-rest needs --gated data/<host>/gated.json");
    const catalog = readJsonSafe(catalogFile, null);
    const gated = readJsonSafe(flags.gated, null);
    const products = Array.isArray(catalog) ? catalog : (catalog?.products ?? []);
    const allowed = new Set((gated?.items ?? []).map((item) => String(item.sku)));
    const only = flags.only ? new Set(flags.only.split(",").map((sku) => sku.trim())) : null;

    const targets = products.filter(
      (product) => allowed.has(String(product.sku)) && (!only || only.has(String(product.sku))),
    );
    if (targets.length === 0) {
      console.log("нечего писать: в каталоге нет товаров, одобренных гейтом");
      return 0;
    }

    // A Russian-only shop must not receive a raw English/Chinese card.
    if (!flags["skip-translation"]) {
      const translation = await checkTranslation({ products: targets, file: catalogFile });
      if (!translation.ok) {
        console.error("непереведённый текст: запись остановлена");
        console.error(formatBlocked(translation));
        return 1;
      }
      if (translation.skipped === "no-key") {
        console.log("translation: Jev пропущен (no-key), детерминированный fallback чист");
      }
    }

    const site = resolveSite();
    if (!flags["dry-run"] && !hasCredentials(site)) throw new ShopError("нет ключей WooCommerce для записи");

    const payloads = [];
    for (const product of targets) {
      const existing = flags["dry-run"] ? null : await wcFindBySku(site, product.sku);
      const payload = buildWcPayload(product, { existingStatus: existing?.status });
      const problems = validatePayload(payload);
      if (problems.length > 0) throw new Error(`${product.sku}: ${problems.join("; ")}`);
      if (existing?.id) payload.id = existing.id;
      payloads.push(payload);

      if (flags["dry-run"]) {
        console.log(`[dry-run] ${existing ? "update" : "create"} ${payload.sku} (${payload.status})`);
        console.log(JSON.stringify(payload, null, 2));
      }
    }

    if (flags["dry-run"]) return 0;

    const results = await wcBatch(site, payloads);
    const failed = results.filter((item) => item.error);
    for (const item of results) {
      console.log(`${item.error ? "FAIL" : "ok  "} ${item.action} #${item.id ?? "?"} ${item.sku} (${item.status ?? "-"})${item.error ? ` — ${JSON.stringify(item.error)}` : ""}`);
    }
    console.log(`итого: ${results.length - failed.length} сохранено, ${failed.length} ошибок, цена не отправлялась`);
    return failed.length > 0 ? 1 : 0;
  });
}

if (isEntryPoint(import.meta.url)) run();
