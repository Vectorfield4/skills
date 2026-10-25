#!/usr/bin/env node
// Triage a candidates JSON: dedup, filter, score, shortlist.

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { isEntryPoint } from "#lib/cli.mjs";
import { canonicalizeUrl, recencyFactor, topicKeywords, matchesTopic } from "#lib/article-search.mjs";

function parseArgs(argv) {
  const o = { file: null, topic: null, lang: null, country: null, limit: 20, out: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--file") o.file = argv[++i];
    else if (argv[i] === "--topic") o.topic = argv[++i];
    else if (argv[i] === "--lang") o.lang = argv[++i];
    else if (argv[i] === "--country") o.country = argv[++i];
    else if (argv[i] === "--limit") o.limit = Number(argv[++i]) || 20;
    else if (argv[i] === "--out") o.out = argv[++i];
  }
  return o;
}

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
  const o = parseArgs(argv);
  if (!o.file) {
    console.error("Usage: node triage.mjs --file <candidates.json> [--topic t] [--lang en] [--country US] [--limit 20] [--out shortlist.json]");
    process.exitCode = 1;
    return null;
  }
  const candidates = JSON.parse(readFileSync(resolve(o.file), "utf8"));
  const shortlist = triage(candidates, o);
  const json = JSON.stringify(shortlist, null, 2);
  if (o.out) {
    writeFileSync(resolve(o.out), json, "utf8");
    console.error(`Wrote ${shortlist.length} shortlisted candidates to ${o.out}`);
  } else {
    console.log(json);
  }
  return shortlist;
}

if (isEntryPoint(import.meta.url)) {
  await run();
}