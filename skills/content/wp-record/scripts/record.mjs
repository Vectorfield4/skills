#!/usr/bin/env node
// Consume a wp-publish result.json and update the article frontmatter.

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { isEntryPoint, parseFlags, wantsHelp } from "#lib/cli.mjs";

const USAGE = `record - consume a wp-publish result.json and update the article frontmatter

  node record.mjs --result result.json --article article.md [--status published] [--help]

Flags
  --result    wp-publish result.json. Required.
  --article   Article markdown file. Required.
  --status    Status to set (e.g. published).
  --help      Print this block and exit 0.

Exit codes
  0  success     1  runtime error     2  usage error
`;

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
  if (wantsHelp(argv)) {
    process.stdout.write(`${USAGE}\n`);
    return 0;
  }

  let flags;
  try {
    flags = parseFlags(argv, {
      result: "string",
      article: "string",
      status: "string",
      help: "boolean",
    });
  } catch (error) {
    process.stderr.write(`${error.message}\n\n${USAGE}`);
    process.exitCode = 2;
    return null;
  }

  if (!flags.result || !flags.article) {
    process.stderr.write(`Usage: node record.mjs --result result.json --article article.md [--status published] [--help]\n\n${USAGE}`);
    process.exitCode = 2;
    return null;
  }

  try {
    const r = record(flags.result, flags.article, flags.status ?? null);
    console.log(`recorded wp_id=${r.id} wp_url=${r.link}`);
    return r;
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
    return null;
  }
}

if (isEntryPoint(import.meta.url)) {
  await run();
}
