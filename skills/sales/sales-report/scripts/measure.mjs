#!/usr/bin/env node
// shop-report/measure: run one node, record honest numbers.
//
// Wall time and request count come from this process, not from the node's own
// claims: the child writes every URL it fetches into a temp file (see
// `lib/shop/metrics.mjs`), and the count is the number of lines.
//
//   node scripts/measure.mjs --run data/<host>/runs/<stamp> --node audit -- \
//     node ../shop-audit/scripts/audit.mjs --offline
//
// Exit code is the node's own exit code; the manifest entry is written either way.

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isEntryPoint } from "#lib/cli.mjs";
import { parseShop, runNode } from "#lib/sales/cli.mjs";
import { openRun, recordNode, saveRun, skillNode } from "#lib/sales/manifest.mjs";

const USAGE = `Usage:
  measure.mjs --run data/<host>/runs/<stamp> --node audit [--status ok|reused] -- <command…>`;

export async function run(argv = process.argv.slice(2)) {
  return runNode(async () => {
    const split = argv.indexOf("--");
    const own = split === -1 ? argv : argv.slice(0, split);
    const command = split === -1 ? [] : argv.slice(split + 1);

    const { flags, host } = parseShop(own, { run: "string", node: "string", status: "string", note: "string" });
    if (!flags.run || !flags.node) throw new Error("measure needs --run and --node");
    if (command.length === 0) throw new Error("measure needs a command after --");

    const metricsFile = join(mkdtempSync(join(tmpdir(), "shop-metrics-")), "requests.log");
    const started = Date.now();
    const child = spawnSync(command[0], command.slice(1), {
      stdio: "inherit",
      env: { ...process.env, SHOP_METRICS_FILE: metricsFile },
      shell: process.platform === "win32",
    });
    const ms = Date.now() - started;
    const requests = existsSync(metricsFile)
      ? readFileSync(metricsFile, "utf8").split("\n").filter(Boolean).length
      : 0;
    const code = child.status ?? 0;
    // Exit 1 is a result in this tree ("nothing to add", "gaps remain");
    // only 2 means the node itself failed.
    const status = flags.status ?? (code === 2 ? "failed" : "ok");

    const opened = openRun({ dir: flags.run, host });
    if (status === "reused") {
      skillNode(opened.manifest, flags.node, { status, note: flags.note ?? "переиспользован" });
    } else {
      recordNode(opened.manifest, flags.node, {
        inputs: { node: flags.node, command: command.join(" ") },
        outputs: { status, exit: code },
        status,
        ms,
        requests,
        note: flags.note ?? "",
      });
    }
    saveRun(opened);
    console.log(`${flags.node}: ${status}, ${ms} ms, ${requests} запросов, exit ${code}`);
    return code;
  });
}

if (isEntryPoint(import.meta.url)) run();
