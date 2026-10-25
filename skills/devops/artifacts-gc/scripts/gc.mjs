#!/usr/bin/env node
// Delete generated task reports older than N days.

import { readdirSync, statSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { isEntryPoint } from "#lib/cli.mjs";

function parseArgs(argv) {
  const o = { dir: "artifacts", days: 30, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--dir") o.dir = argv[++i];
    else if (argv[i] === "--days") o.days = Number(argv[++i]) || 30;
    else if (argv[i] === "--dry-run") o.dryRun = true;
  }
  return o;
}

export async function run(argv = process.argv.slice(2)) {
  const o = parseArgs(argv);
  const dir = resolve(o.dir);
  let files = [];
  try {
    files = readdirSync(dir);
  } catch {
    console.log(`directory not found: ${dir}`);
    return [];
  }
  const cutoff = Date.now() - o.days * 24 * 60 * 60 * 1000;
  const removed = [];
  for (const name of files) {
    const full = join(dir, name);
    try {
      const st = statSync(full);
      if (st.isFile() && st.mtimeMs < cutoff) {
        if (o.dryRun) console.log(`would remove: ${full}`);
        else rmSync(full);
        removed.push(full);
      }
    } catch {}
  }
  console.log(`${o.dryRun ? "would remove" : "removed"} ${removed.length} file(s) older than ${o.days} days`);
  return removed;
}

if (isEntryPoint(import.meta.url)) {
  await run();
}