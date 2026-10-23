#!/usr/bin/env node
// reader-fetch: read one page through the public reader proxy. The step for a
// 403 WAF block or a body that only exists after JavaScript runs, where a direct
// fetch and a UA swap both fail. Standalone: prints the standardized parse JSON
// with `method: "reader-proxy"`.
//
// It returns what the proxy returned and never invents text: a captcha, a login
// wall, or a paywall stays a recorded failure.

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { isEntryPoint } from "#lib/cli.mjs";
import { fetchViaReader } from "#lib/reader.mjs";

function wordCount(text) {
  return String(text ?? "").trim().split(/\s+/).filter(Boolean).length;
}

function attempt(method, ok, error = null) {
  return { method, ok: Boolean(ok), error: ok ? null : (error ?? "failed") };
}

function baseResult(url) {
  return {
    url,
    status: "failed",
    method: "none",
    title: null,
    byline: null,
    excerpt: null,
    textContent: null,
    wordCount: 0,
    charCount: 0,
    siteName: null,
    httpStatus: null,
    contentType: null,
    error: null,
    fallback: "none",
    attempts: [],
  };
}

/** `fetchViaReader` shaped as the parse JSON the rest of the chain emits. */
export async function readerFetch(url, opts = {}) {
  const minWords = opts.minWords ?? 80;
  const result = baseResult(url);
  const fetched = await fetchViaReader(url, {
    timeoutMs: opts.timeoutMs,
    endpoint: opts.endpoint,
    fetchImpl: opts.fetchImpl,
    minChars: opts.minChars,
  });

  result.httpStatus = fetched.status;
  result.contentType = fetched.contentType;
  result.title = fetched.title;
  result.charCount = fetched.text?.length ?? 0;

  if (!fetched.ok) {
    result.error = fetched.error;
    result.attempts.push(attempt("reader-proxy", false, fetched.error));
    return result;
  }

  // Same gate as the other parsers: a body under `minWords` is not an article.
  const words = wordCount(fetched.text);
  if (words < minWords) {
    result.error = `reader-proxy body too short (${words} words < ${minWords})`;
    result.attempts.push(attempt("reader-proxy", false, result.error));
    return result;
  }

  result.status = "ok";
  result.method = "reader-proxy";
  result.textContent = fetched.text;
  result.wordCount = words;
  result.attempts.push(attempt("reader-proxy", true));
  return result;
}

function parseArgs(argv) {
  const options = { url: null, out: null, minWords: 80, timeoutMs: undefined };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--url") options.url = argv[++i];
    else if (arg === "--out") options.out = argv[++i];
    else if (arg === "--min-words") options.minWords = Number(argv[++i]) || 80;
    else if (arg === "--timeout-ms") options.timeoutMs = Number(argv[++i]) || undefined;
    else if (!options.url && !arg.startsWith("--")) options.url = arg;
  }
  return options;
}

export async function run(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (!options.url) {
    console.error("Usage: node <this-file> <url> [--out file.json] [--min-words N] [--timeout-ms N]");
    process.exitCode = 1;
    return null;
  }

  const result = await readerFetch(options.url, {
    minWords: options.minWords,
    timeoutMs: options.timeoutMs,
  });

  const json = JSON.stringify(result, null, 2);
  if (options.out) {
    writeFileSync(resolve(options.out), json, "utf8");
    console.error(`Wrote reader result to ${options.out}`);
  } else {
    console.log(json);
  }
  console.error(
    `status=${result.status} method=${result.method} words=${result.wordCount} chars=${result.charCount}`,
  );
  return result;
}

if (isEntryPoint(import.meta.url)) {
  await run();
}
