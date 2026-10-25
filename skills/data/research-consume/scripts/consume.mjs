#!/usr/bin/env node
// Read a research pack and emit a handoff for write-article.

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { isEntryPoint } from "#lib/cli.mjs";

function parseArgs(argv) {
  const o = { pack: null, out: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--pack") o.pack = argv[++i];
    else if (argv[i] === "--out") o.out = argv[++i];
  }
  return o;
}

function slugify(text) {
  return String(text ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "article";
}

export function consume(packPath) {
  const pack = JSON.parse(readFileSync(resolve(packPath), "utf8"));
  const candidates = Array.isArray(pack.candidates) ? pack.candidates : [];
  const selected = candidates.filter((c) => c.selected);
  if (selected.length === 0) {
    throw new Error("research pack has no selected candidates");
  }
  const primary = selected[0];
  const topic = pack.topic || "";
  const genreCandidate = /research|study|paper|arxiv/i.test(topic) ? "research" : "media";
  return {
    slug: slugify(topic || primary.title),
    packPath: packPath,
    genreCandidate,
    primarySourceUrl: primary.url,
    selectedCount: selected.length,
    candidates: selected.map((c) => ({ title: c.title, url: c.url, lang: c.lang })),
  };
}

export async function run(argv = process.argv.slice(2)) {
  const o = parseArgs(argv);
  if (!o.pack) {
    console.error("Usage: node consume.mjs --pack <pack.json> [--out handoff.json]");
    process.exitCode = 1;
    return null;
  }
  const handoff = consume(o.pack);
  const json = JSON.stringify(handoff, null, 2);
  if (o.out) {
    writeFileSync(resolve(o.out), json, "utf8");
    console.error(`Wrote handoff to ${o.out}`);
  } else {
    console.log(json);
  }
  return handoff;
}

if (isEntryPoint(import.meta.url)) {
  await run();
}