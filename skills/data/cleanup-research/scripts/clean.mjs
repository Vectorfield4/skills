#!/usr/bin/env node
// Cleanup generated research artifacts older than N days.
//
// Run:
//   node <this-file> [--dir docs/research/generated] [--days 7] [--dry-run]

import { readdirSync, statSync, rmSync, existsSync } from "node:fs";
import { resolve, join, relative } from "node:path";
import { isEntryPoint } from "#lib/cli.mjs";

function parseArgs(argv) {
  const options = { dir: null, days: 7, dryRun: false, recursive: true };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dir") options.dir = argv[++i];
    else if (arg === "--days") {
      const n = Number(argv[++i]);
      options.days = Number.isFinite(n) ? n : 7;
    }
    else if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--no-recursive") options.recursive = false;
    else if (!arg.startsWith("--") && !options.dir) options.dir = arg;
  }
  return options;
}

function walk(dir, recursive, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full, { throwIfNoEntry: false });
    if (!st) continue;
    if (st.isDirectory()) {
      if (recursive) walk(full, recursive, out);
    } else if (st.isFile()) {
      out.push({ path: full, mtime: st.mtimeMs });
    }
  }
  return out;
}

export async function run(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const dir = resolve(options.dir || "docs/research/generated");
  if (!existsSync(dir)) {
    console.error(`Directory does not exist: ${dir}`);
    return { removed: 0, kept: 0, dir };
  }

  const cutoff = Date.now() - options.days * 24 * 60 * 60 * 1000;
  const files = walk(dir, options.recursive);
  let removed = 0;
  let kept = 0;
  const removedFiles = [];

  for (const f of files) {
    const ageDays = (Date.now() - f.mtime) / (24 * 60 * 60 * 1000);
    if (f.mtime < cutoff) {
      removedFiles.push({ path: f.path, ageDays });
      if (!options.dryRun) {
        try {
          rmSync(f.path);
          removed++;
        } catch (e) {
          console.error(`failed to remove ${f.path}: ${e.message}`);
        }
      } else {
        removed++;
      }
    } else {
      kept++;
    }
  }

  // remove empty dirs (best effort) when not dry run
  if (!options.dryRun) {
    // simple: attempt rmdir on dir children bottom-up not implemented; skip
  }

  console.log(`dir: ${dir}`);
  console.log(`days: ${options.days}`);
  console.log(`scanned: ${files.length}, removed: ${removed}, kept: ${kept}`);
  if (options.dryRun) console.log("dry-run: no files deleted");
  for (const f of removedFiles) console.log(`  - ${relative(process.cwd(), f.path)} (${f.ageDays.toFixed(1)}d)`);
  return { removed, kept, dir, files: removedFiles.map((f) => f.path) };
}

if (isEntryPoint(import.meta.url)) {
  await run();
}
