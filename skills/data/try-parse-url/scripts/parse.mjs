#!/usr/bin/env node
// Try-parse-url: Readability first, with HTTP pre-check and standardized output.

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { isEntryPoint } from "#lib/cli.mjs";
import { BROWSER_UA, fetchText } from "#lib/http.mjs";
import { extract as extractArticle } from "../../article-extractor/scripts/extract-article.mjs";

function wordCount(text) {
  return String(text ?? "").trim().split(/\s+/).filter(Boolean).length;
}

/** Every method the parser tried, in order. Never prunes failures. */
function attempt(method, ok, error = null) {
  return { method, ok: Boolean(ok), error: ok ? null : (error ?? "failed") };
}

function parseArgs(argv) {
  const options = { url: null, out: null, slug: null, minWords: 80 };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--url") options.url = argv[++i];
    else if (arg === "--out") options.out = argv[++i];
    else if (arg === "--slug") options.slug = argv[++i];
    else if (arg === "--min-words") options.minWords = Number(argv[++i]) || 80;
    else if (!options.url && !arg.startsWith("--")) options.url = arg;
  }
  return options;
}

export async function parse(url, minWords = 80) {
  const result = {
    url,
    status: "failed",
    method: "none",
    title: null,
    byline: null,
    excerpt: null,
    textContent: null,
    wordCount: 0,
    siteName: null,
    httpStatus: null,
    contentType: null,
    error: null,
    fallback: "none",
    attempts: [],
  };

  // 1. HTTP pre-check
  let html = null;
  try {
    const res = await fetch(url, { headers: { "User-Agent": BROWSER_UA } });
    result.httpStatus = res.status;
    result.contentType = res.headers.get("content-type");
    if (res.ok) html = await res.text();
    result.attempts.push(
      attempt("http-precheck", res.ok, res.ok ? null : `HTTP ${res.status}`),
    );
  } catch (e) {
    result.error = `fetch error: ${e.message}`;
    result.fallback = "none";
    result.attempts.push(attempt("http-precheck", false, result.error));
    return result;
  }

  if (result.httpStatus !== 200) {
    result.error = `HTTP ${result.httpStatus}`;
    result.fallback = result.httpStatus === 403 ? "webfetch" : "none";
    return result;
  }
  if (result.contentType && !/text\/html|application\/xhtml/i.test(result.contentType)) {
    result.error = `non-HTML content-type: ${result.contentType}`;
    result.fallback = "none";
    return result;
  }

  // 2. Readability
  try {
    const article = await extractArticle(url);
    if (article && !article.error) {
      const wc = wordCount(article.textContent);
      if (wc >= minWords) {
        result.status = "ok";
        result.method = "readability";
        result.title = article.title ?? null;
        result.byline = article.byline ?? null;
        result.excerpt = article.excerpt ?? null;
        result.textContent = article.textContent ?? null;
        result.wordCount = wc;
        result.siteName = article.siteName ?? null;
        result.fallback = "none";
        result.attempts.push(attempt("readability", true));
        return result;
      }
      // short body
      result.error = `Readability body too short (${wc} words < ${minWords})`;
      result.fallback = wc < 40 ? "google-cache" : "webfetch";
      result.attempts.push(attempt("readability", false, result.error));
    } else {
      result.error = article?.error ?? "Readability returned null";
      result.fallback = "webfetch";
      result.attempts.push(attempt("readability", false, result.error));
    }
  } catch (e) {
    result.error = `extract error: ${e.message}`;
    result.fallback = "webfetch";
    result.attempts.push(attempt("readability", false, result.error));
  }

  // 3. Interstitial markers (JS shell)
  if (html && /data-n-a-sg|batchexecute|enable JavaScript/i.test(html)) {
    result.fallback = "google-cache";
  }

  return result;
}

export async function run(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (!options.url) {
    console.error("Usage: node <this-file> <url> [--out file.json] [--slug slug] [--min-words N]");
    process.exitCode = 1;
    return null;
  }

  const result = await parse(options.url, options.minWords);
  const json = JSON.stringify(result, null, 2);

  let outPath = options.out;
  if (!outPath && options.slug) {
    outPath = resolve("docs", "research", `${options.slug}.parsed.json`);
  }
  if (outPath) {
    writeFileSync(resolve(outPath), json, "utf8");
    console.error(`Wrote parse result to ${outPath}`);
  } else {
    console.log(json);
  }
  console.error(`status=${result.status} method=${result.method} words=${result.wordCount} fallback=${result.fallback}`);
  return result;
}

if (isEntryPoint(import.meta.url)) {
  await run();
}