#!/usr/bin/env node
// Key-free news candidate fetcher. Sources are data: pass --sources <file.json>.
//
// Run:  node <this-file> --sources sources.json [--out candidates.json]

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { isEntryPoint } from "#lib/cli.mjs";
import { BROWSER_UA, fetchText } from "#lib/http.mjs";
import {
  attachSourceMeta,
  dedup,
  filterByTopic,
  normalizeSources,
  parseAtom,
  parseHackerNews,
  parseHtmlList,
  parseJsonList,
  parseRSS,
} from "#lib/article-search.mjs";

export async function fetchSource(source) {
  try {
    // Newsroom pages are marketing sites and often sit behind a WAF that
    // rejects a non-browser user agent; feeds do not care.
    const text =
      source.type === "html-list" || source.type === "json-list"
        ? await fetchText(source.url, {
            userAgent: BROWSER_UA,
            ...(source.type === "json-list" ? { method: source.method, body: source.body } : {}),
          })
        : await fetchText(source.url);
    let items = [];
    if (source.type === "rss") items = parseRSS(text, source.name);
    else if (source.type === "atom") items = parseAtom(text, source.name);
    else if (source.type === "hn") items = parseHackerNews(JSON.parse(text), source.name);
    else if (source.type === "html-list") items = parseHtmlList(text, source);
    else if (source.type === "json-list") items = parseJsonList(JSON.parse(text), source);
    return attachSourceMeta(items, source);
  } catch (e) {
    console.error(`[skip] ${source.name}: ${e.message}`);
    return [];
  }
}

function parseArgs(argv) {
  const options = { topic: null, lang: null, country: null, sources: null, out: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--topic" || arg.startsWith("--topic=")) {
      const inline = arg.startsWith("--topic=") ? arg.slice("--topic=".length) : null;
      if (inline !== null) {
        options.topic = inline.trim() || null;
      } else {
        const parts = [];
        i++;
        while (i < argv.length && !argv[i].startsWith("--")) {
          parts.push(argv[i]);
          i++;
        }
        i--;
        options.topic = parts.join(" ").trim() || null;
      }
    } else if (arg === "--lang" || arg.startsWith("--lang=")) {
      options.lang = arg.startsWith("--lang=") ? arg.slice("--lang=".length) : argv[++i];
      if (options.lang) options.lang = options.lang.trim() || null;
    } else if (arg === "--country" || arg.startsWith("--country=")) {
      options.country = arg.startsWith("--country=") ? arg.slice("--country=".length) : argv[++i];
      if (options.country) options.country = options.country.trim() || null;
    } else if (arg === "--sources" || arg.startsWith("--sources=")) {
      options.sources = arg.startsWith("--sources=") ? arg.slice("--sources=".length) : argv[++i];
    } else if (arg === "--out" || arg.startsWith("--out=")) {
      options.out = arg.startsWith("--out=") ? arg.slice("--out=".length) : argv[++i];
    }
  }
  return options;
}

export async function run(argv = process.argv.slice(2)) {
  const { topic, lang, country, sources: sourcesPath, out } = parseArgs(argv);
  if (!sourcesPath) {
    console.error("Usage: node <this-file> --sources <file.json> [--topic <topic>] [--lang <lang>] [--country <country>] [--out file.json]");
    process.exitCode = 1;
    return null;
  }

  const sources = normalizeSources(JSON.parse(readFileSync(resolve(sourcesPath), "utf8")));

  const all = [];
  for (const source of sources) {
    all.push(...(await fetchSource(source)));
  }
  let filtered = all;
  if (topic) filtered = filterByTopic(filtered, topic);
  if (lang) filtered = filtered.filter((item) => item.lang === lang);
  if (country) filtered = filtered.filter((item) => item.country === country);
  const unique = dedup(filtered);
  const json = JSON.stringify(unique, null, 2);

  if (out) {
    writeFileSync(out, json, "utf8");
    console.error(`Wrote ${unique.length} candidates to ${out}`);
  } else {
    console.log(json);
    console.error(`Fetched ${all.length} items, ${unique.length} unique.`);
  }
  return unique;
}

if (isEntryPoint(import.meta.url)) {
  await run();
}