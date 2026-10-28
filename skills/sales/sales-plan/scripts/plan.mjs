#!/usr/bin/env node
// shop-plan: gap tags × tagged models -> a ranked, deterministic queue.
//
// Gap closing comes first; the premium queue runs only for tags that already
// have a product but lack a flagship. Integer scoring, tie-break by sku.
//
//   node scripts/plan.mjs --audit data/<host>/audit.json --tagged data/<host>/tagged-index.json
//                         --sellers data/<host>/sellers.yaml [--limit 3] [--premium-per-tag 1]
//                         [--out data/<host>/plan.json]
//
// Exit 0 — queue written, 1 — nothing to add, 2 — workflow error.

import { isEntryPoint } from "#lib/cli.mjs";
import { parseShop, runNode } from "#lib/sales/cli.mjs";
import { buildPlan, plannedCandidates } from "#lib/sales/plan.mjs";
import { readSellersDoc } from "#lib/sales/sellers.mjs";
import { readJsonSafe, writeJson } from "#lib/sales/stable.mjs";

const USAGE = `Usage:
  plan.mjs --audit data/<host>/audit.json --tagged data/<host>/tagged-index.json
           --sellers data/<host>/sellers.yaml [--limit 3] [--premium-per-tag 1]
           [--out data/<host>/plan.json]`;

export async function run(argv = process.argv.slice(2)) {
  return runNode(async () => {
    const { flags, host, dir } = parseShop(argv, {
      audit: "string",
      tagged: "string",
      sellers: "string",
      catalog: "string",
      limit: "number",
      "premium-per-tag": "number",
    });

    const audit = readJsonSafe(flags.audit ?? `${dir}/audit.json`, null);
    if (!audit) throw new Error("audit.json not found: run shop-audit first");
    const tagged = readJsonSafe(flags.tagged ?? `${dir}/tagged-index.json`, null);
    if (!tagged) throw new Error("tagged-index.json not found: run shop-tagmap first");
    const sellersDoc = readSellersDoc(flags.sellers ?? `${dir}/sellers.yaml`);
    const catalogDoc = readJsonSafe(flags.catalog ?? "products/catalog.json", null);
    const catalog = Array.isArray(catalogDoc) ? catalogDoc : (catalogDoc?.products ?? []);
    const out = flags.out ?? `${dir}/plan.json`;

    const plan = buildPlan({
      audit,
      tagged,
      sellers: sellersDoc?.items ?? [],
      catalog,
      limitPerTag: Number(flags.limit ?? 3),
      premiumPerTag: Number(flags["premium-per-tag"] ?? 1),
      host,
    });
    const candidates = plannedCandidates(plan);

    writeJson(out, { ...plan, candidates: candidates.map((item) => item.sku) });

    const gaps = plan.queue.filter((row) => row.reason === "gap").length;
    const premium = plan.queue.filter((row) => row.reason === "premium").length;
    console.log(
      `${out}: ${gaps} пробелов закрываются, ${premium} премиальных доборов, ${plan.updates.length} существующих товаров на дозаполнение, ${candidates.length} кандидат(ов)`,
    );
    for (const row of plan.queue) {
      const top = row.candidates[0];
      console.log(`  ${row.reason.padEnd(7)} ${row.tag} → ${top?.sku ?? "-"} (score ${top?.score ?? 0})`);
    }
    return candidates.length > 0 ? 0 : 1;
  });
}

if (isEntryPoint(import.meta.url)) run();
