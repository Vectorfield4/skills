#!/usr/bin/env node
// shop-catalog: gate verdicts + existing catalog -> products/catalog.json.
//
// The catalog carries no prices. Output is sorted by sku and idempotent: a
// second run on the same input changes no byte.
//
//   node scripts/merge.mjs --catalog products/catalog.json --gated data/<host>/gated.json
//                          [--out products/catalog.json] [--check]
//
// Exit 0 — written (or no changes with --check), 1 — --check found changes,
// 2 — workflow error.

import { isEntryPoint } from "#lib/cli.mjs";
import { parseShop, runNode } from "#lib/sales/cli.mjs";
import { mergeCatalog } from "#lib/sales/catalog.mjs";
import { readJsonSafe, writeJson } from "#lib/sales/stable.mjs";

const USAGE = `Usage:
  merge.mjs --catalog products/catalog.json --gated data/<host>/gated.json
            [--out products/catalog.json] [--check]`;

export async function run(argv = process.argv.slice(2)) {
  return runNode(async () => {
    const { flags } = parseShop(argv, {
      catalog: "string",
      gated: "string",
      check: "boolean",
    });

    const catalogFile = flags.catalog ?? "products/catalog.json";
    if (!flags.gated) throw new Error("merge needs --gated data/<host>/gated.json");
    const catalog = readJsonSafe(catalogFile, null);
    const gated = readJsonSafe(flags.gated, null);
    if (!gated) throw new Error(`gated file not readable: ${flags.gated}`);

    const items = (gated.items ?? []).map((item) => ({ ...item, categories: item.categories }));
    const result = mergeCatalog({
      catalog: Array.isArray(catalog) ? catalog : (catalog?.products ?? []),
      items,
    });

    const changed = result.stats.added.length + result.stats.updated.length;
    if (flags.check) {
      console.log(
        `--check: ${changed} изменений (${result.stats.added.length} новых, ${result.stats.updated.length} обновлений), ${result.stats.untouched.length} без изменений`,
      );
      return changed === 0 ? 0 : 1;
    }

    writeJson(flags.out ?? catalogFile, result.catalog);
    console.log(
      `${flags.out ?? catalogFile}: ${result.stats.total} товар(ов), добавлено ${result.stats.added.length}, обновлено ${result.stats.updated.length}, без изменений ${result.stats.untouched.length}`,
    );
    for (const sku of result.stats.added) console.log(`  + ${sku}`);
    for (const sku of result.stats.updated) console.log(`  ~ ${sku}`);
    return 0;
  });
}

if (isEntryPoint(import.meta.url)) run();
