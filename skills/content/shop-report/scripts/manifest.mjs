#!/usr/bin/env node
// shop-report/manifest: the coordinator's notebook.
//
// The nodes are separate processes, often run in parallel by subagents, so the
// run manifest is written here: start, one `add` per finished node, then
// `report.mjs` reads it. Numbers come from the caller — the script stores them,
// it does not pretend to measure somebody else's process.
//
//   node scripts/manifest.mjs start --run data/<host>/runs/<stamp> [--tree audit,vendors,…]
//   node scripts/manifest.mjs add   --run <dir> --node audit --status ok --ms 812 --requests 4
//   node scripts/manifest.mjs add   --run <dir> --node harvest --status reused --note "index fresh"
//   node scripts/manifest.mjs seen  --run <dir>
//
// Exit 0 — recorded, 1 — `seen` found nothing, 2 — error.

import { join } from "node:path";
import { isEntryPoint } from "#lib/cli.mjs";
import { parseShop, runNode } from "#lib/shop/cli.mjs";
import { loadManifest, nodeOrder, openRun, recordNode, saveRun, skillNode } from "#lib/shop/manifest.mjs";

const USAGE = `Usage:
  manifest.mjs start --run data/<host>/runs/<stamp> [--tree audit,vendors,…]
  manifest.mjs add   --run <dir> --node audit --status ok|reused|failed [--ms 0] [--requests 0] [--note ""]
  manifest.mjs seen  --run <dir>`;

export const SHOP_TREE = [
  "capabilities",
  "vendors",
  "aliases",
  "audit",
  "harvest",
  "ledger",
  "tagmap",
  "plan",
  "gate",
  "catalog",
  "write",
  "verify-store",
  "verify-coverage",
  "report",
];

export async function run(argv = process.argv.slice(2)) {
  return runNode(async () => {
    const command = argv[0] ?? "";
    const { flags, host } = parseShop(argv.slice(1), {
      run: "string",
      node: "string",
      status: "string",
      ms: "number",
      requests: "number",
      note: "string",
      tree: "string",
    });
    if (!flags.run) throw new Error("manifest needs --run data/<host>/runs/<stamp>");

    if (command === "start") {
      const tree = flags.tree ? flags.tree.split(",").map((node) => node.trim()) : SHOP_TREE;
      const opened = openRun({ dir: flags.run, host, tree });
      opened.manifest.previous = loadManifest(join(flags.run, ".."))
        ? null
        : opened.manifest.previous;
      saveRun(opened);
      console.log(`${flags.run}: прогон начат, узлов в дереве ${tree.length}`);
      return 0;
    }

    if (command === "add") {
      if (!flags.node) throw new Error("add needs --node <name>");
      const opened = openRun({ dir: flags.run, host });
      const status = ["ok", "reused", "failed"].includes(flags.status) ? flags.status : "ok";
      if (status === "reused") {
        skillNode(opened.manifest, flags.node, { status, ms: 0, note: flags.note ?? "переиспользован" });
      } else {
        recordNode(opened.manifest, flags.node, {
          inputs: { node: flags.node, run: flags.run },
          outputs: { status },
          status,
          ms: Number(flags.ms ?? 0),
          requests: Number(flags.requests ?? 0),
          note: flags.note ?? "",
        });
      }
      saveRun(opened);
      console.log(`${flags.node}: ${status}`);
      return 0;
    }

    if (command === "seen") {
      const manifest = loadManifest(flags.run);
      const nodes = nodeOrder(manifest ?? {});
      if (nodes.length === 0) return 1;
      for (const node of nodes) {
        const entry = manifest?.nodes?.[node];
        console.log(`${node}\t${entry?.status ?? "missing"}\t${entry?.ms ?? 0}\t${entry?.requests ?? 0}`);
      }
      return 0;
    }

    console.error(USAGE);
    return 2;
  });
}

if (isEntryPoint(import.meta.url)) run();
