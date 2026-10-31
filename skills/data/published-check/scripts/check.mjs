#!/usr/bin/env node
// Coverage check: which candidates already have an article pair (and its translation)?
//
// Answers one question before any parsing or translation: has this story been
// published already? A candidate is covered when its canonical URL, its slug or
// its normalized title matches a markdown pair in the project's articles/ dir,
// or an existing post in a WordPress dump.

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { canonicalizeUrl } from "#lib/article-search.mjs";
import { isEntryPoint, parseFlags, wantsHelp } from "#lib/cli.mjs";
import { archiveFromDir, matchCandidate } from "#lib/content/utilities/article-archive.mjs";
import { normalizeTitle } from "#lib/content/utilities/read-article.mjs";

const USAGE = `published-check: coverage check for news candidates

  node check.mjs --file candidates.json [--articles articles] [--wp wp-posts.json] [--out coverage.json] [--help]

Flags
  --file      Candidates JSON to check. Required.
  --articles  Articles directory. Default: articles.
  --wp        WordPress posts dump (optional).
  --out       Write result to this file instead of stdout.
  --help      Print this block and exit 0.

Exit codes
  0  success     1  missing file     2  usage error
`;

function readJson(file) {
  return JSON.parse(readFileSync(resolve(file), "utf8").replace(/^\uFEFF/, ""));
}

/** Optional dump of existing WP posts: [{ slug, title, status, link, source_url }]. */
export function loadPosts(file) {
  if (!file) return [];
  const raw = readJson(file);
  const list = Array.isArray(raw) ? raw : (raw.posts ?? []);
  return list.map((p) => ({
    slug: p.slug ?? "",
    title: normalizeTitle(p.title),
    status: p.status ?? "",
    urls: [p.link, p.url, p.source_url, p.sourceUrl].filter(Boolean).map(canonicalizeUrl),
  }));
}

export function loadArchive(dir) {
  return archiveFromDir(dir);
}

/** Split candidates into `fresh` and `covered`, keeping the match reason. */
export function checkCoverage(candidates, archive, posts = []) {
  const fresh = [];
  const covered = [];
  for (const candidate of candidates) {
    const matched = matchCandidate(candidate, archive, posts);
    if (matched) covered.push({ ...candidate, matched });
    else fresh.push(candidate);
  }
  return { fresh, covered };
}

export { matchCandidate };

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
      articles: "string",
      wp: "string",
      out: "string",
      json: "boolean",
      help: "boolean",
    });
  } catch (error) {
    process.stderr.write(`${error.message}\n\n${USAGE}`);
    process.exitCode = 2;
    return null;
  }

  if (!flags.file) {
    process.stderr.write(`Usage: node check.mjs --file candidates.json [--articles articles] [--wp wp-posts.json] [--out coverage.json] [--help]\n\n${USAGE}`);
    process.exitCode = 2;
    return null;
  }

  let candidates;
  try {
    candidates = readJson(flags.file);
  } catch (error) {
    process.stderr.write(`${error?.message ?? error}\n`);
    process.exitCode = 1;
    return null;
  }

  const list = Array.isArray(candidates) ? candidates : (candidates.candidates ?? []);

  let archive;
  try {
    archive = loadArchive(resolve(flags.articles ?? "articles"));
  } catch (error) {
    process.stderr.write(`${error?.message ?? error}\n`);
    process.exitCode = 1;
    return null;
  }

  const posts = loadPosts(flags.wp);
  const result = checkCoverage(list, archive, posts);
  const json = JSON.stringify(result, null, 2);

  if (flags.out) {
    try {
      writeFileSync(resolve(flags.out), `${json}\n`, "utf8");
    } catch (error) {
      process.stderr.write(`${error?.message ?? error}\n`);
      process.exitCode = 1;
      return null;
    }
    console.error(`Wrote ${result.fresh.length} fresh and ${result.covered.length} covered to ${flags.out}`);
  } else {
    console.log(json);
  }

  return result;
}

if (isEntryPoint(import.meta.url)) {
  await run();
}
