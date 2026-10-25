#!/usr/bin/env node
// Thematic article search. Sources are data: pass --sources <file.json>.

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { isEntryPoint } from "#lib/cli.mjs";
import { BROWSER_UA, fetchText } from "#lib/http.mjs";
import {
  attachSourceMeta,
  dedup,
  filterByTopic,
  normalizeSources,
  parseRSS,
  parseAtom,
  parseHackerNews,
  parseHtmlList,
  parseJsonList,
} from "#lib/article-search.mjs";

export async function fetchSource(source) {
  try {
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
  const options = { topic: null, sources: null, limit: null, out: null, lang: null, country: null };
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
    } else if (arg === "--sources" || arg.startsWith("--sources=")) {
      options.sources = arg.startsWith("--sources=") ? arg.slice("--sources=".length) : argv[++i];
    } else if (arg === "--limit" || arg.startsWith("--limit=")) {
      const raw = arg.startsWith("--limit=") ? arg.slice("--limit=".length) : argv[++i];
      const n = Number(raw);
      options.limit = Number.isFinite(n) ? n : null;
    } else if (arg === "--lang" || arg.startsWith("--lang=")) {
      const val = arg.startsWith("--lang=") ? arg.slice("--lang=".length) : argv[++i];
      options.lang = val ? val.trim() || null : null;
    } else if (arg === "--country" || arg.startsWith("--country=")) {
      const val = arg.startsWith("--country=") ? arg.slice("--country=".length) : argv[++i];
      options.country = val ? val.trim() || null : null;
    } else if (arg === "--out" || arg.startsWith("--out=")) {
      options.out = arg.startsWith("--out=") ? arg.slice("--out=".length) : argv[++i];
    }
  }
  return options;
}

export async function run(argv = process.argv.slice(2)) {
  const { topic, sources: sourcesPath, limit, out, lang, country } = parseArgs(argv);
  if (!topic || !sourcesPath) {
    console.error("Usage: node <this-file> --topic <topic> --sources <file.json> [--limit N] [--lang <lang>] [--country <country>] [--out file.json]");
    process.exitCode = 1;
    return null;
  }

  const sources = normalizeSources(JSON.parse(readFileSync(resolve(sourcesPath), "utf8")));

  const all = [];
  for (const source of sources) {
    const items = await fetchSource(source);
    all.push(...filterByTopic(items, topic));
  }
  let filtered = all;
  if (lang) filtered = filtered.filter((item) => item.lang === lang);
  if (country) filtered = filtered.filter((item) => item.country === country);
  const unique = dedup(filtered);
  const capped = Number.isFinite(limit) && limit > 0 ? unique.slice(0, limit) : unique;

  const json = JSON.stringify(capped, null, 2);
  if (out) {
    writeFileSync(resolve(out), json, "utf8");
    console.error(`Wrote ${capped.length} candidates to ${out}`);
  } else {
    console.log(json);
    console.error(`Fetched ${all.length} items, ${capped.length} unique.`);
  }
  return capped;
}

export const search = run;

if (isEntryPoint(import.meta.url)) {
  await run();
}