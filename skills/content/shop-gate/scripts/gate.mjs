#!/usr/bin/env node
// shop-gate: three verdicts per candidate — trusted brand, unique product, enough spec.
//
//   node scripts/gate.mjs all     --plan data/<host>/plan.json --audit data/<host>/audit.json
//                                 --sellers data/<host>/sellers.yaml --out data/<host>/gated.json
//   node scripts/gate.mjs trust   --product <file.json>
//   node scripts/gate.mjs unique  --product <file.json> [--audit data/<host>/audit.json]
//   node scripts/gate.mjs spec    --product <file.json>
//
// Exit 0 — gate written / verdict ok, 1 — verdict failed, 2 — workflow error.

import { isEntryPoint } from "#lib/cli.mjs";
import { parseShop, runNode } from "#lib/shop/cli.mjs";
import { gateAll, specVerdict, trustVerdict, uniqueVerdict } from "#lib/shop/gates.mjs";
import { plannedCandidates } from "#lib/shop/plan.mjs";
import { readSellersDoc } from "#lib/shop/sellers.mjs";
import { readJsonSafe, writeJson } from "#lib/shop/stable.mjs";

const USAGE = `Usage:
  gate.mjs all    --plan data/<host>/plan.json --audit data/<host>/audit.json
                  --sellers data/<host>/sellers.yaml --out data/<host>/gated.json
  gate.mjs trust  --product <file.json>
  gate.mjs unique --product <file.json> [--audit data/<host>/audit.json]
  gate.mjs spec   --product <file.json>`;

export async function run(argv = process.argv.slice(2)) {
  return runNode(async () => {
    const command = argv[0] ?? "";
    const { flags, host, dir } = parseShop(argv.slice(1), {
      plan: "string",
      audit: "string",
      sellers: "string",
      product: "string",
    });

    if (command === "all") {
      const plan = readJsonSafe(flags.plan ?? `${dir}/plan.json`, null);
      if (!plan) throw new Error("plan.json not found: run shop-plan first");
      const audit = readJsonSafe(flags.audit ?? `${dir}/audit.json`, null);
      if (!audit) throw new Error("audit.json not found: run shop-audit first");
      const sellers = readSellersDoc(flags.sellers ?? `${dir}/sellers.yaml`);
      const out = flags.out ?? `${dir}/gated.json`;

      const items = gateAll({
        candidates: plannedCandidates(plan),
        sellers: sellers?.items ?? [],
        existing: audit.products ?? [],
      });
      const publish = items.filter((item) => item.verdict === "publish");
      const draft = items.filter((item) => item.verdict !== "publish");

      writeJson(out, {
        host,
        generated_at: new Date().toISOString(),
        stats: { total: items.length, publish: publish.length, draft: draft.length },
        items,
      });

      console.log(`${out}: ${publish.length} к публикации, ${draft.length} в draft`);
      for (const item of items) {
        console.log(`  ${item.verdict.padEnd(7)} ${item.sku}  ${item.reasons.join("; ") || "ok"}`);
      }
      return items.length > 0 ? 0 : 1;
    }

    if (["trust", "unique", "spec"].includes(command)) {
      if (!flags.product) throw new Error(`${command} needs --product <file.json>`);
      const product = readJsonSafe(flags.product, null);
      if (!product) throw new Error(`product file not readable: ${flags.product}`);
      const sellers = readSellersDoc(flags.sellers ?? `${dir}/sellers.yaml`);
      const audit = readJsonSafe(flags.audit ?? `${dir}/audit.json`, null);

      const verdict =
        command === "trust"
          ? trustVerdict(product, sellers?.items ?? [])
          : command === "unique"
            ? uniqueVerdict(product, audit?.products ?? [])
            : specVerdict(product);

      console.log(`${command}: ${verdict.ok ? "ok" : "нет"} — ${verdict.reason}`);
      return verdict.ok ? 0 : 1;
    }

    console.error(USAGE);
    return 2;
  });
}

if (isEntryPoint(import.meta.url)) run();
