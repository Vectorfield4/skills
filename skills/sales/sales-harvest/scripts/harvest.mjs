#!/usr/bin/env node
// shop-harvest: brand sitemap -> product pages -> schema.org Product facts.
//
// No judgement: it returns names, skus, prices, images and categories. Prices
// land in `data/<host>/index/` and stop there — `shop-price-ledger` moves them
// into `prices.yaml`, and no write node may read them.
//
//   node scripts/harvest.mjs --domain unitree.com [--max-urls 40]
//   node scripts/harvest.mjs --sellers data/<host>/sellers.yaml [--max-brands 4] [--ttl-days 7]
//   node scripts/harvest.mjs --domain hiwonder.com --feed-file feed.json
//
// Exit 0 — at least one product harvested (or index still fresh), 1 — nothing
// found, 2 — workflow error.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isEntryPoint } from "#lib/cli.mjs";
import { parseShop, runNode } from "#lib/sales/cli.mjs";
import { harvestDomain, harvestFeed } from "#lib/sales/harvest.mjs";
import { readSellersDoc } from "#lib/sales/sellers.mjs";
import { readJsonSafe, writeJson } from "#lib/sales/stable.mjs";

const USAGE = `Usage:
  harvest.mjs --domain unitree.com [--max-urls 40]
  harvest.mjs --sellers data/<host>/sellers.yaml [--max-brands 4] [--ttl-days 7]
  harvest.mjs --domain hiwonder.com --feed-file feed.json`;

const DAY_MS = 24 * 60 * 60 * 1000;

function fresh(file, ttlDays) {
  const doc = readJsonSafe(file, null);
  if (!doc?.fetched_at) return false;
  const age = Date.now() - new Date(doc.fetched_at).getTime();
  return Number.isFinite(age) && age >= 0 && age < ttlDays * DAY_MS;
}

function indexFile(indexDir, domain) {
  return join(indexDir, `${domain.replace(/[^\p{L}\p{N}._-]+/gu, "-")}.json`);
}

export async function run(argv = process.argv.slice(2)) {
  return runNode(async () => {
    const { flags, dir } = parseShop(argv, {
      domain: "string",
      sellers: "string",
      "feed-file": "string",
      "max-brands": "number",
      "max-urls": "number",
      "ttl-days": "number",
      "delay-ms": "number",
    });

    const indexDir = flags.out ?? join(dir, "index");
    const ttlDays = Number(flags["ttl-days"] ?? 7);
    const maxUrls = Number(flags["max-urls"] ?? 40);
    const maxBrands = Number(flags["max-brands"] ?? 4);
    const delayMs = Number(flags["delay-ms"] ?? 0);

    // A saved Shopify `/products.json` feed: same facts, transport done outside.
    if (flags["feed-file"]) {
      if (!flags.domain) {
        console.error(USAGE);
        return 2;
      }
      const file = indexFile(indexDir, flags.domain);
      const result = harvestFeed(readFileSync(flags["feed-file"], "utf8"), flags.domain);
      writeJson(file, result);
      console.log(`${result.domain}: ${result.products.length} моделей (feed) → ${file}`);
      return result.products.length > 0 ? 0 : 1;
    }

    let domains = [];
    if (flags.domain) domains = [flags.domain];
    else if (flags.sellers) {
      const doc = readSellersDoc(flags.sellers);
      domains = (doc?.items ?? []).map((item) => item.domain).filter(Boolean);
    }
    if (domains.length === 0) {
      console.error(USAGE);
      return 2;
    }

    const plan = [];
    for (const domain of [...new Set(domains)].sort()) {
      const file = indexFile(indexDir, domain);
      if (!flags.domain && fresh(file, ttlDays)) {
        plan.push({ domain, status: "fresh", file });
        continue;
      }
      plan.push({ domain, status: "to-fetch", file });
    }

    const toFetch = plan.filter((item) => item.status === "to-fetch").slice(0, maxBrands);
    for (const item of toFetch) {
      const result = await harvestDomain({
        domain: item.domain,
        limit: maxUrls,
        delayMs,
      });
      // A blocked origin is not evidence the catalogue is empty: keep the index
      // we already have instead of overwriting it with zero models.
      const previous = readJsonSafe(item.file, null);
      if (
        result.products.length === 0 &&
        Array.isArray(previous?.products) &&
        previous.products.length > 0
      ) {
        console.log(
          `${item.domain}: источник не ответил, прежний индекс сохранён (${previous.products.length} моделей) → ${item.file}`,
        );
        for (const warning of result.warnings.slice(0, 3)) console.log(`  ! ${warning}`);
        continue;
      }
      writeJson(item.file, result);
      console.log(
        `${item.domain}: ${result.products.length} моделей, ${result.warnings.length} предупреждений → ${item.file}`,
      );
      for (const warning of result.warnings.slice(0, 3)) console.log(`  ! ${warning}`);
    }

    const skipped = plan.filter((item) => item.status === "fresh").length;
    if (skipped > 0) console.log(`свежий индекс, без сети: ${skipped} бренд(ов)`);

    const total = plan.filter((item) => item.status === "to-fetch" && existsSync(item.file)).length;
    return total + skipped > 0 ? 0 : 1;
  });
}

if (isEntryPoint(import.meta.url)) run();
