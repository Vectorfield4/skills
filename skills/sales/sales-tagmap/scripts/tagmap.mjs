#!/usr/bin/env node
// shop-tagmap: harvested models -> canonical site tags.
//
// Rules live in the project (`products/tag-rules.yaml`), the vocabulary in the
// blog (`tag-aliases.json` + `audit.json`). A model with no matching rule is
// reported as unmapped; it never receives a plausible tag.
//
//   node scripts/tagmap.mjs --index data/<host>/index --audit data/<host>/audit.json
//                           --rules products/tag-rules.yaml [--aliases data/<host>/tag-aliases.json]
//                           --out data/<host>/tagged-index.json
//
// Exit 0 — at least one model mapped, 1 — none mapped, 2 — workflow error.

import { readdirSync } from "node:fs";
import { join } from "node:path";
import { isEntryPoint } from "#lib/cli.mjs";
import { parseShop, runNode } from "#lib/sales/cli.mjs";
import { readListDoc } from "#lib/sales/narrow-yaml.mjs";
import { readJsonSafe, writeJson } from "#lib/sales/stable.mjs";
import { tagIndex } from "#lib/sales/tagmap.mjs";

const USAGE = `Usage:
  tagmap.mjs --index data/<host>/index --audit data/<host>/audit.json
             --rules products/tag-rules.yaml [--aliases data/<host>/tag-aliases.json]
             --out data/<host>/tagged-index.json`;

export function readRules(file) {
  const doc = readListDoc(file);
  if (!doc) throw new Error(`tag rules not found: ${file}`);
  return (doc.items ?? [])
    .map((item) => ({ kind: item.kind, match: item.match, tags: item.tags, robot: item.robot }))
    .filter((rule) => rule.kind && rule.match);
}

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
    const { flags, host, dir } = parseShop(argv, {
      index: "string",
      audit: "string",
      rules: "string",
      aliases: "string",
    });

    const indexDir = flags.index ?? join(dir, "index");
    const rules = readRules(flags.rules ?? "products/tag-rules.yaml");
    const audit = readJsonSafe(flags.audit ?? join(dir, "audit.json"), null);
    if (!audit) throw new Error("audit.json not found: run shop-audit first");
    const aliases = readJsonSafe(flags.aliases ?? join(dir, "tag-aliases.json"), {});
    const out = flags.out ?? join(dir, "tagged-index.json");

    const products = indexProducts(indexDir);
    const tagged = tagIndex({
      products,
      rules,
      siteCanons: audit.known_tag_canons ?? [],
      aliases,
    });

    writeJson(out, {
      host,
      generated_at: new Date().toISOString(),
      rules_file: flags.rules ?? "products/tag-rules.yaml",
      stats: {
        harvested: products.length,
        mapped: tagged.products.length,
        unmapped: tagged.unmapped.length,
        skipped: tagged.skipped.length,
      },
      products: tagged.products,
      unmapped: tagged.unmapped,
      skipped: tagged.skipped,
    });

    console.log(
      `${out}: ${tagged.products.length} из ${products.length} моделей получили теги, ${tagged.unmapped.length} без правил, ${tagged.skipped.length} аксессуаров пропущено`,
    );
    for (const item of tagged.products.slice(0, 10)) {
      console.log(`  ok   ${item.sku}  ${item.tags.join("/")}`);
    }
    for (const item of tagged.skipped.slice(0, 5)) {
      console.log(
        `  skip ${item.sku}  ${item.name} — ${item.reason === "accessory" ? "аксессуар, не робот" : "не распознан тип робота"}`,
      );
    }
    for (const item of tagged.unmapped.slice(0, 5)) {
      console.log(`  ???  ${item.sku}  ${item.name} — добавьте правило в products/tag-rules.yaml`);
    }
    return tagged.products.length > 0 ? 0 : 1;
  });
}

if (isEntryPoint(import.meta.url)) run();
