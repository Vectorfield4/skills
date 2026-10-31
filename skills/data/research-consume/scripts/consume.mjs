#!/usr/bin/env node
// Read a research pack and emit a handoff for write-article.

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { isEntryPoint, parseFlags, wantsHelp } from "#lib/cli.mjs";

const USAGE = `consume — read a research pack and emit a handoff

  node consume.mjs --pack <pack.json> [--out handoff.json] [--help]

Flags
  --pack   Research pack JSON. Required.
  --out    Write handoff to this file.
  --help   Print this block and exit 0.

Exit codes
  0  success     1  missing file     2  usage error
`;

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
  process.exitCode = 0;

  if (wantsHelp(argv)) {
    process.stdout.write(`${USAGE}\n`);
    return 0;
  }

  let flags;
  try {
    flags = parseFlags(argv, {
      pack: "string",
      out: "string",
      help: "boolean",
    });
  } catch (error) {
    process.stderr.write(`${error.message}\n\n${USAGE}`);
    process.exitCode = 2;
    return null;
  }

  if (!flags.pack) {
    process.stderr.write(`Usage: node consume.mjs --pack <pack.json> [--out handoff.json] [--help]\n\n${USAGE}`);
    process.exitCode = 2;
    return null;
  }

  let handoff;
  try {
    handoff = consume(flags.pack);
  } catch (error) {
    process.stderr.write(`${error?.message ?? error}\n`);
    process.exitCode = 1;
    return null;
  }

  const json = JSON.stringify(handoff, null, 2);
  if (flags.out) {
    try {
      writeFileSync(resolve(flags.out), json, "utf8");
    } catch (error) {
      process.stderr.write(`${error?.message ?? error}\n`);
      process.exitCode = 1;
      return null;
    }
    console.error(`Wrote handoff to ${flags.out}`);
  } else {
    console.log(json);
  }

  return handoff;
}

if (isEntryPoint(import.meta.url)) {
  await run();
}
