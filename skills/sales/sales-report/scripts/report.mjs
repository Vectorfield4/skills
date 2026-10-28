#!/usr/bin/env node
// shop-report: manifest -> summary, and "did the second run change anything".
//
//   node scripts/report.mjs --run data/<host>/runs/<stamp> [--diff data/<host>/runs/<prev>]
//                           [--catalog products/catalog.json]
//
// Exit 0 — report written, 1 — the catalog changed since the previous run,
// 2 — workflow error.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isEntryPoint } from "#lib/cli.mjs";
import { parseShop, runNode } from "#lib/sales/cli.mjs";
import { loadManifest } from "#lib/sales/manifest.mjs";
import { diffRuns, printReport, readSummary, summarize } from "#lib/sales/report.mjs";
import { hashValue, readJsonSafe, writeJson } from "#lib/sales/stable.mjs";

const USAGE = `Usage:
  report.mjs --run data/<host>/runs/<stamp> [--diff data/<host>/runs/<prev>]
             [--catalog products/catalog.json]`;

function catalogHash(file) {
  try {
    const doc = readJsonSafe(file, null);
    if (!doc) return "";
    return hashValue(Array.isArray(doc) ? doc : (doc.products ?? []));
  } catch {
    return "";
  }
}

export async function run(argv = process.argv.slice(2)) {
  return runNode(async () => {
    const { flags } = parseShop(argv, { run: "string", diff: "string", catalog: "string" });
    if (!flags.run) throw new Error("report needs --run data/<host>/runs/<stamp>");

    const manifest = loadManifest(flags.run);
    if (!manifest) throw new Error(`no manifest in ${flags.run}`);
    const summary = printReport(manifest, { label: `shop run ${flags.run}` });

    let diff = null;
    if (flags.diff) {
      const before = loadManifest(flags.diff);
      diff = diffRuns(before, manifest);
      console.log(
        `diff: ${diff.changed.length} узлов изменились, ${diff.same.length} без изменений${
          diff.changed.length ? ` (${diff.changed.join(", ")})` : ""
        }`,
      );
    }

    let catalog = null;
    if (flags.catalog) {
      catalog = { file: flags.catalog, hash: catalogHash(flags.catalog) };
    }

    writeJson(join(flags.run, "summary.json"), { ...summary, diff, catalog });
    console.log(`summary: ${join(flags.run, "summary.json")}`);

    if (flags.diff && catalog) {
      const previous = readSummary(flags.diff);
      const before = previous?.catalog?.hash ?? null;
      const changed = before ? before !== catalog.hash : null;
      if (changed === null) console.log("catalog: нет хеша в прошлом прогоне, сравнивать не с чем");
      else console.log(changed ? "catalog: изменился" : "catalog: без изменений");
      return changed === true ? 1 : 0;
    }
    return summary.failed > 0 ? 1 : 0;
  });
}

if (isEntryPoint(import.meta.url)) run();
