#!/usr/bin/env node
// shop-vendors: the brand allowlist. Our internal trustworthy signal, never rendered.
//
//   node scripts/vendors.mjs init  [--example docs/sellers.example.yaml] [--host hello-robot.ru]
//   node scripts/vendors.mjs list   [--file data/<host>/sellers.yaml]
//   node scripts/vendors.mjs check  --brand Unitree | --domain unitree.com
//   node scripts/vendors.mjs add    --name Unitree --domain unitree.com [--kind brand] [--flagship "G1, H2"]
//
// Exit 0 — done / brand is in the allowlist, 1 — brand is not in the allowlist,
// 2 — workflow error (bad file, missing args).

import { join } from "node:path";
import { isEntryPoint } from "#lib/cli.mjs";
import { printRows, parseShop, runNode } from "#lib/shop/cli.mjs";
import {
  findSeller,
  initSellers,
  normalizeSellers,
  readSellersDoc,
  writeSellersDoc,
} from "#lib/shop/sellers.mjs";

const USAGE = `Usage:
  vendors.mjs init  [--example docs/sellers.example.yaml] [--host hello-robot.ru]
  vendors.mjs list  [--file data/<host>/sellers.yaml]
  vendors.mjs check --brand Unitree | --domain unitree.com
  vendors.mjs add   --name Unitree --domain unitree.com [--kind brand] [--flagship "G1, H2"]`;

export function vendorsFile(flags, dir) {
  return flags.file ?? join(dir, "sellers.yaml");
}

export async function run(argv = process.argv.slice(2)) {
  return runNode(async () => {
    const command = argv[0] ?? "";
    const rest = argv.slice(1);
    const { flags, host, dir } = parseShop(rest, {
      file: "string",
      example: "string",
      brand: "string",
      domain: "string",
      name: "string",
      kind: "string",
      flagship: "string",
      note: "string",
    });
    const file = vendorsFile(flags, dir);

    if (command === "init") {
      const result = initSellers({
        file,
        example: flags.example ?? "docs/sellers.example.yaml",
        host,
      });
      const count = result.doc?.items?.length ?? 0;
      console.log(`${result.created ? "создан" : "уже есть"} ${file}: ${count} бренд(ов)`);
      return 0;
    }

    if (command === "list") {
      const doc = readSellersDoc(file);
      if (!doc || doc.items.length === 0) {
        console.log(`пусто: ${file}`);
        return 1;
      }
      printRows(
        doc.items.map((item) => ({
          name: item.name,
          domain: item.domain,
          kind: item.kind,
          flagship: item.flagship || "-",
        })),
        ["name", "domain", "kind", "flagship"],
      );
      return 0;
    }

    if (command === "check") {
      const doc = readSellersDoc(file);
      const found = findSeller(doc?.items ?? [], { brand: flags.brand ?? flags.name, domain: flags.domain });
      if (!found) {
        console.log(`не в allowlist: ${flags.brand || flags.domain || "(пусто)"}`);
        return 1;
      }
      console.log(`в allowlist: ${found.name} (${found.domain}, ${found.kind})`);
      return 0;
    }

    if (command === "add") {
      if (!flags.name || !flags.domain) throw new Error("add needs --name and --domain");
      const doc = readSellersDoc(file) ?? { host, items: [] };
      const items = normalizeSellers([
        ...doc.items,
        {
          name: flags.name,
          domain: flags.domain,
          kind: flags.kind ?? "brand",
          flagship: flags.flagship ?? "",
          note: flags.note ?? "",
        },
      ]);
      writeSellersDoc(file, { ...doc, host: doc.host || host, items });
      console.log(`${file}: ${items.length} бренд(ов), добавлен ${flags.name}`);
      return 0;
    }

    console.error(USAGE);
    return 2;
  });
}

if (isEntryPoint(import.meta.url)) run();
