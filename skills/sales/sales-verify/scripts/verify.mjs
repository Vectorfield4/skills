#!/usr/bin/env node
// shop-verify: is the product on the site, with its tags, after publishing?
//
//   node scripts/verify.mjs store    --gated data/<host>/gated.json [--host hello-robot.ru]
//   node scripts/verify.mjs coverage --audit data/<host>/audit.json [--host hello-robot.ru]
//
// `store` checks the Store API (drafts are invisible there by design);
// `coverage` re-runs the tag matrix against what the Store API actually returns.
//
// Exit 0 — everything verified, 1 — gaps remain, 2 — workflow error.

import { join } from "node:path";
import { isEntryPoint } from "#lib/cli.mjs";
import { buildAudit } from "#lib/sales/audit.mjs";
import { parseShop, runNode } from "#lib/sales/cli.mjs";
import { readJsonSafe, writeJson } from "#lib/sales/stable.mjs";
import { storeProducts, resolveSite } from "#lib/sales/wc.mjs";
import { verifyStore } from "#lib/sales/verify.mjs";

const USAGE = `Usage:
  verify.mjs store    --gated data/<host>/gated.json [--host hello-robot.ru]
  verify.mjs coverage --audit data/<host>/audit.json [--host hello-robot.ru]`;

export async function run(argv = process.argv.slice(2)) {
  return runNode(async () => {
    const command = argv[0] ?? "";
    const { flags, host, dir } = parseShop(argv.slice(1), {
      gated: "string",
      audit: "string",
      aliases: "string",
    });
    const site = resolveSite();
    const aliases = readJsonSafe(flags.aliases ?? join(dir, "tag-aliases.json"), {});

    if (command === "store") {
      const gated = readJsonSafe(flags.gated ?? join(dir, "gated.json"), null);
      if (!gated) throw new Error("gated.json not found: run shop-gate first");
      const expected = (gated.items ?? [])
        .filter((item) => item.verdict === "publish")
        .map((item) => ({ sku: item.sku, tags: item.tags ?? [] }));
      if (expected.length === 0) {
        console.log("нечего проверять: гейт ничего не публиковал");
        return 0;
      }

      const products = await storeProducts(site.url);
      const result = verifyStore({ expected, products, aliases });
      const out = join(dir, "verify-store.json");
      writeJson(out, { host, checked_at: new Date().toISOString(), ...result });

      console.log(`${out}: ${result.okCount} из ${result.rows.length} видно в Store API`);
      for (const row of result.rows.filter((item) => !item.ok)) {
        console.log(`  нет  ${row.sku} — ${row.problems.join("; ")}`);
      }
      return result.ok ? 0 : 1;
    }

    if (command === "coverage") {
      const audit = readJsonSafe(flags.audit ?? join(dir, "audit.json"), null);
      if (!audit) throw new Error("audit.json not found: run shop-audit first");
      const products = await storeProducts(site.url);
      const fresh = buildAudit({
        posts: (audit.tags ?? []).flatMap((row) =>
          Array.from({ length: row.articles ?? 0 }, () => ({ tags: [] })),
        ),
        termNames: new Map(),
        products,
        aliases,
        host,
      });
      const before = new Set(audit.gaps ?? []);
      const coveredNow = (audit.tags ?? []).filter(
        (row) => before.has(row.tag) && fresh.product_tag_canons.includes(row.canon),
      );
      const stillOpen = (audit.tags ?? []).filter(
        (row) => before.has(row.tag) && !fresh.product_tag_canons.includes(row.canon),
      );
      const out = join(dir, "verify-coverage.json");
      writeJson(out, {
        host,
        checked_at: new Date().toISOString(),
        before: audit.gaps ?? [],
        covered_now: coveredNow.map((row) => row.tag),
        still_open: stillOpen.map((row) => row.tag),
        store_products: products.length,
      });
      console.log(
        `${out}: закрыто ${coveredNow.length}, осталось ${stillOpen.length} пробелов, на витрине ${products.length} товар(ов)`,
      );
      for (const row of stillOpen) console.log(`  нет  ${row.tag}`);
      return stillOpen.length === 0 ? 0 : 1;
    }

    console.error(USAGE);
    return 2;
  });
}

if (isEntryPoint(import.meta.url)) run();
