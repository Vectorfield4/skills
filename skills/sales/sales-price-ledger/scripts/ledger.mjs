#!/usr/bin/env node
// shop-price-ledger: the only place a price exists.
//
// Harvested JSON-LD prices move into `data/<host>/prices.yaml` for the phone
// call. This file is gitignored, never sent to WooCommerce and never rendered.
//
//   node scripts/ledger.mjs record [--index data/<host>/index] [--file data/<host>/prices.yaml]
//   node scripts/ledger.mjs list   [--file data/<host>/prices.yaml] [--with-price]
//
// Exit 0 — ledger written / listed, 1 — no prices recorded, 2 — workflow error.

import { readdirSync } from "node:fs";
import { join } from "node:path";
import { isEntryPoint } from "#lib/cli.mjs";
import { parseShop, printRows, runNode } from "#lib/sales/cli.mjs";
import { readPrices, upsertPrices, writePrices } from "#lib/sales/ledger.mjs";
import { readJsonSafe } from "#lib/sales/stable.mjs";

const USAGE = `Usage:
  ledger.mjs record [--index data/<host>/index] [--file data/<host>/prices.yaml]
  ledger.mjs list   [--file data/<host>/prices.yaml] [--with-price]`;

function indexProducts(indexDir) {
  const products = [];
  for (const name of readdirSync(indexDir).filter((file) => file.endsWith(".json")).sort()) {
    const doc = readJsonSafe(join(indexDir, name), null);
    for (const product of doc?.products ?? []) products.push(product);
  }
  return products.sort((a, b) => String(a.sku).localeCompare(String(b.sku)));
}

export async function run(argv = process.argv.slice(2)) {
  return runNode(async () => {
    const command = argv[0] ?? "";
    const { flags, host, dir } = parseShop(argv.slice(1), {
      index: "string",
      file: "string",
      "with-price": "boolean",
    });
    const file = flags.file ?? join(dir, "prices.yaml");

    if (command === "record") {
      const indexDir = flags.index ?? join(dir, "index");
      const products = indexProducts(indexDir);
      // Snapshot, not a history: a renamed sku must not leave two rows behind.
      const result = upsertPrices({ doc: null, items: products, host });
      writePrices(file, result.doc);
      console.log(
        `${file}: ${result.doc.items.length} моделей, ${result.withPrice} с публичной ценой (только локально)`,
      );
      return result.doc.items.length > 0 ? 0 : 1;
    }

    if (command === "list") {
      const doc = readPrices(file);
      const items = (doc?.items ?? []).filter((item) => !flags["with-price"] || item.price !== "");
      if (items.length === 0) {
        console.log(`пусто: ${file}`);
        return 1;
      }
      printRows(
        items.map((item) => ({
          sku: item.sku,
          brand: item.brand,
          model: item.model,
          price: item.price || "-",
          currency: item.currency || "-",
        })),
        ["sku", "brand", "model", "price", "currency"],
      );
      return 0;
    }

    console.error(USAGE);
    return 2;
  });
}

if (isEntryPoint(import.meta.url)) run();
