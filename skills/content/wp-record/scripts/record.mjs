#!/usr/bin/env node
// Consume a wp-publish result.json and update the article frontmatter.

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { isEntryPoint } from "#lib/cli.mjs";

function parseArgs(argv) {
  const o = { result: null, article: null, status: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--result") o.result = argv[++i];
    else if (argv[i] === "--article") o.article = argv[++i];
    else if (argv[i] === "--status") o.status = argv[++i];
  }
  return o;
}

export function record(resultPath, articlePath, status) {
  const result = JSON.parse(readFileSync(resolve(resultPath), "utf8"));
  if (!result.id) throw new Error("result.json has no id");
  let raw = readFileSync(resolve(articlePath), "utf8");
  raw = raw.replace(/^wp_id:.*\n/m, "");
  raw = raw.replace(/^wp_url:.*\n/m, "");
  raw = raw.replace(/^status:.*\n/m, status ? `status: ${status}\n` : (m) => m);
  raw = raw.replace(/\n---\n/, `\nwp_id: ${result.id}\nwp_url: ${result.link}\n---\n`);
  writeFileSync(resolve(articlePath), raw, "utf8");
  return { id: result.id, link: result.link };
}

export async function run(argv = process.argv.slice(2)) {
  const o = parseArgs(argv);
  if (!o.result || !o.article) {
    console.error("Usage: node record.mjs --result result.json --article article.md [--status published]");
    process.exitCode = 1;
    return null;
  }
  const r = record(o.result, o.article, o.status);
  console.log(`recorded wp_id=${r.id} wp_url=${r.link}`);
  return r;
}

if (isEntryPoint(import.meta.url)) {
  await run();
}