#!/usr/bin/env node
// Aliases: the blog's tag vocabulary -> data/<host>/tag-aliases.json.
//
// The project's `src/shared/config/productTags.ts` is the only source of truth;
// this node copies it into the data directory in the shape the shop reads.
//
//   node scripts/aliases.mjs [--source src/shared/config/productTags.ts]
//                            [--host hello-robot.ru] [--out data/<host>/tag-aliases.json]
//
// Exit 0 — file written and non-empty, 2 — source unreadable.

import { join } from "node:path";
import { isEntryPoint } from "#lib/cli.mjs";
import { readAliasesFile } from "#lib/sales/aliases.mjs";
import { parseShop, runNode } from "#lib/sales/cli.mjs";
import { writeJson } from "#lib/sales/stable.mjs";

const USAGE = `Usage:
  aliases.mjs [--source src/shared/config/productTags.ts]
              [--host hello-robot.ru] [--out data/<host>/tag-aliases.json]`;

export async function run(argv = process.argv.slice(2)) {
  return runNode(async () => {
    const { flags, host, dir } = parseShop(argv, { source: "string" });
    const source = flags.source ?? "src/shared/config/productTags.ts";
    const out = flags.out ?? join(dir, "tag-aliases.json");

    const aliases = readAliasesFile(source);
    writeJson(out, aliases);
    const canon = Object.keys(aliases).length;
    const variants = Object.values(aliases).reduce((sum, list) => sum + list.length, 0);
    console.log(`${out}: ${canon} канонов, ${variants} вариантов написания`);
    return canon > 0 ? 0 : 2;
  });
}

if (isEntryPoint(import.meta.url)) run();
