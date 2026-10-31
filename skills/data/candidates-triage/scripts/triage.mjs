#!/usr/bin/env node
// Triage a candidates JSON: dedup, filter, score, shortlist.

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { isEntryPoint, parseFlags, wantsHelp } from "#lib/cli.mjs";
import { canonicalizeUrl, recencyFactor, topicKeywords, matchesTopic } from "#lib/article-search.mjs";

const USAGE = `triage — dedup, filter and shortlist candidates

  node triage.mjs --file <candidates.json> [--topic t] [--lang en] [--country US] [--limit 20] [--out shortlist.json] [--help]

Flags
  --file     Candidates JSON. Required.
  --topic    Topic filter.
  --lang     Language filter.
  --country  Country filter.
  --limit    Max items (default 20).
  --out      Write result to this file.
  --help     Print this block and exit 0.

Exit codes
  0  success     1  missing file     2  usage error
`;

export function triage(candidates, opts = {}) {
  const seen = new Set();
  const keywords = opts.topic ? topicKeywords(opts.topic) : [];
  const result = [];
  for (const c of candidates) {
    const key = canonicalizeUrl(c.url);
    if (seen.has(key)) continue;
    seen.add(key);
    if (opts.lang && c.lang !== opts.lang) continue;
    if (opts.country && c.country !== opts.country) continue;
    if (keywords.length > 0 && !matchesTopic(c, keywords)) continue;
    const score = (c.weight || 1) * recencyFactor(c.date);
    result.push({ ...c, score });
  }
  result.sort((a, b) => b.score - a.score);
  return opts.limit > 0 ? result.slice(0, opts.limit) : result;
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
      file: "string",
      topic: "string",
      lang: "string",
      country: "string",
      limit: "number",
      out: "string",
      help: "boolean",
    });
  } catch (error) {
    process.stderr.write(`${error.message}\n\n${USAGE}`);
    process.exitCode = 2;
    return null;
  }

  if (!flags.file) {
    process.stderr.write(`Usage: node triage.mjs --file <candidates.json> [--topic t] [--lang en] [--country US] [--limit 20] [--out shortlist.json] [--help]\n\n${USAGE}`);
    process.exitCode = 2;
    return null;
  }

  let candidates;
  try {
    candidates = JSON.parse(readFileSync(resolve(flags.file), "utf8"));
  } catch (error) {
    process.stderr.write(`${error?.message ?? error}\n`);
    process.exitCode = 1;
    return null;
  }

  const shortlist = triage(candidates, {
    topic: flags.topic,
    lang: flags.lang,
    country: flags.country,
    limit: flags.limit ?? 20,
  });

  const json = JSON.stringify(shortlist, null, 2);
  if (flags.out) {
    try {
      writeFileSync(resolve(flags.out), json, "utf8");
    } catch (error) {
      process.stderr.write(`${error?.message ?? error}\n`);
      process.exitCode = 1;
      return null;
    }
    console.error(`Wrote ${shortlist.length} shortlisted candidates to ${flags.out}`);
  } else {
    console.log(json);
  }

  return shortlist;
}

if (isEntryPoint(import.meta.url)) {
  await run();
}
