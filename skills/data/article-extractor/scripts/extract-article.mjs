#!/usr/bin/env node
// Universal article extractor (Mozilla Readability + jsdom, no API keys).
//
// Run:  node <this-file> <url> [--out article.json]

import { writeFileSync } from "node:fs";
import { Readability } from "@mozilla/readability";
import { JSDOM, VirtualConsole } from "jsdom";
import { isEntryPoint } from "#lib/cli.mjs";
import { BROWSER_UA, fetchText } from "#lib/http.mjs";

export async function extract(url) {
  const html = await fetchText(url, { timeoutMs: 20000, userAgent: BROWSER_UA });
  // A silent virtual console: jsdom otherwise dumps every unparsable stylesheet
  // to stderr, which buries the actual CLI output.
  const dom = new JSDOM(html, { url, virtualConsole: new VirtualConsole() });
  const article = new Readability(dom.window.document).parse();
  if (!article) return { error: "Could not extract article", url };
  return {
    title: article.title,
    byline: article.byline,
    excerpt: article.excerpt,
    content: article.content,
    textContent: article.textContent,
    siteName: article.siteName,
    url,
  };
}

function parseArgs(argv) {
  const options = { url: null, out: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--out") options.out = argv[++i];
    else if (!options.url) options.url = argv[i];
  }
  return options;
}

export async function run(argv = process.argv.slice(2)) {
  const { url, out } = parseArgs(argv);
  if (!url) {
    console.error("Usage: node <this-file> <url> [--out file.json]");
    process.exitCode = 1;
    return null;
  }

  let result;
  try {
    result = await extract(url);
  } catch (e) {
    result = { error: e.message, url };
  }

  const json = JSON.stringify(result, null, 2);
  if (out) {
    writeFileSync(out, json, "utf8");
    console.error(`Wrote ${out}`);
  } else {
    console.log(json);
  }
  return result;
}

if (isEntryPoint(import.meta.url)) {
  await run();
}
