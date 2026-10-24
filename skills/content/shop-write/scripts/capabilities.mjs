#!/usr/bin/env node
// shop-write/capabilities: which transport can add a product right now.
//
// WC REST keys answer -> `rest` (one batch call, tags and images in the payload).
// Otherwise the WordPress skill (MCP) -> `wp` (create + terms + image + publish).
// The choice is written once and read by the write node; it is not re-decided
// per product.
//
//   node scripts/capabilities.mjs --wp-skill [--out data/<host>/transport.json]
//
// `--wp-skill` means "this session has the WordPress MCP"; the probe cannot see
// the agent's tool list, so the caller states it.
//
// Exit 0 — a transport is available, 2 — neither transport works.

import { join } from "node:path";
import { isEntryPoint } from "#lib/cli.mjs";
import { parseShop, runNode } from "#lib/shop/cli.mjs";
import { readJsonSafe, writeJson } from "#lib/shop/stable.mjs";
import { hasCredentials, resolveSite, wcRequest } from "#lib/shop/wc.mjs";

const USAGE = "Usage: capabilities.mjs --wp-skill [--host hello-robot.ru] [--out data/<host>/transport.json]";

export async function run(argv = process.argv.slice(2)) {
  return runNode(async () => {
    const { flags, host, dir } = parseShop(argv, { "wp-skill": "boolean" });
    const out = flags.out ?? join(dir, "transport.json");
    const site = resolveSite();

    let rest = false;
    let restError = "";
    if (hasCredentials(site)) {
      try {
        await wcRequest(site, "/products", { query: { per_page: 1 } });
        rest = true;
      } catch (error) {
        restError = String(error?.message ?? error);
      }
    } else {
      restError = "нет ключей WooCommerce";
    }

    const wp = Boolean(flags["wp-skill"]);
    const previous = readJsonSafe(out, null);
    const chosen = rest ? "rest" : wp ? "wp" : "";

    const doc = {
      host,
      checked_at: new Date().toISOString(),
      site: site.url,
      rest,
      wp,
      chosen,
      note: rest ? "WC REST: один batch-запрос" : wp ? "WordPress skill: 4 вызова MCP" : restError,
      previous: previous?.chosen ?? null,
    };
    writeJson(out, doc);

    if (!chosen) {
      console.error(`нет транспорта: ${restError}; MCP недоступен`);
      return 2;
    }
    console.log(`${out}: транспорт ${chosen}${rest ? " (WC REST)" : " (WordPress skill)"}`);
    return 0;
  });
}

if (isEntryPoint(import.meta.url)) run();
