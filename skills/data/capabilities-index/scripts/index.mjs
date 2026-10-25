#!/usr/bin/env node
// Scan capability specs and source specs, write an index JSON.

import { readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { isEntryPoint } from "#lib/cli.mjs";

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full));
    else if (name.endsWith(".md")) out.push(full);
  }
  return out;
}

function titleOf(text) {
  const m = text.match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : null;
}

export function buildIndex(root) {
  const files = walk(root).filter((f) => !f.endsWith("index.json"));
  return files.map((f) => {
    const text = readFileSync(f, "utf8");
    return {
      path: relative(process.cwd(), f).replace(/\\/g, "/"),
      title: titleOf(text),
      bytes: Buffer.byteLength(text, "utf8"),
    };
  });
}

export async function run(argv = process.argv.slice(2)) {
  const o = { root: "docs/capabilities", out: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--root") o.root = argv[++i];
    else if (argv[i] === "--out") o.out = argv[++i];
  }
  const root = resolve(o.root);
  const index = buildIndex(root);
  const outPath = resolve(o.out || join(o.root, "index.json"));
  writeFileSync(outPath, JSON.stringify({ generatedAt: new Date().toISOString(), count: index.length, files: index }, null, 2), "utf8");
  console.log(`Indexed ${index.length} specs -> ${outPath}`);
  return index;
}

if (isEntryPoint(import.meta.url)) {
  await run();
}