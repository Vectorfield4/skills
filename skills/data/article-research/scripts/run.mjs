#!/usr/bin/env node
// Article research runner: fetch candidates -> score -> select top-N -> parse -> write pack.
//
// Discovery (source-discovery) is an LLM step and is NOT automated here. Supply
// candidates via --candidates <file.json> (output of source-discovery) or fetch
// from RSS/Atom feeds via --sources <file.json> (news-fetcher flow).
//
// Run:
//   node <this-file> --topic "AI robots" --country RU --sources sources.json --out docs/research/pack.json
//   node <this-file> --topic "AI robots" --candidates discovered.json --out docs/research/pack.json

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { isEntryPoint } from "#lib/cli.mjs";
import {
  dedup,
  filterByTopic,
  normalizeSources,
  recencyFactor,
} from "#lib/article-search.mjs";
import { fetchSource } from "../../news-fetcher/scripts/fetch-candidates.mjs";
import { fallback } from "../../parse-fallback/scripts/fallback.mjs";

function slugify(raw) {
  return String(raw ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "research-pack";
}

function parseArgs(argv) {
  const options = {
    topic: null,
    country: null,
    lang: null,
    sources: null,
    candidates: null,
    limit: 8,
    out: null,
    minWords: 80,
    parse: true,
    noFilter: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--topic") {
      const parts = [];
      i++;
      while (i < argv.length && !argv[i].startsWith("--")) {
        parts.push(argv[i]);
        i++;
      }
      i--;
      options.topic = parts.join(" ").trim() || null;
    } else if (arg === "--country") options.country = argv[++i];
    else if (arg === "--lang") options.lang = argv[++i];
    else if (arg === "--sources") options.sources = argv[++i];
    else if (arg === "--candidates") options.candidates = argv[++i];
    else if (arg === "--limit") options.limit = Number(argv[++i]) || 8;
    else if (arg === "--out") options.out = argv[++i];
    else if (arg === "--min-words") options.minWords = Number(argv[++i]) || 80;
    else if (arg === "--no-parse") options.parse = false;
    else if (arg === "--no-filter") options.noFilter = true;
  }
  return options;
}

function normalizeCandidate(raw) {
  if (typeof raw === "string") raw = { url: raw };
  const url = raw.url || raw.link;
  if (!url) return null;
  return {
    source: raw.source ?? raw.source_name ?? null,
    title: raw.title ?? null,
    url,
    date: raw.date ?? raw.published ?? raw.pubDate ?? raw.created_at ?? null,
    lang: raw.lang ?? raw.language ?? null,
    country: raw.country ?? null,
    weight: Number.isFinite(raw.weight) ? raw.weight : (raw.weight ?? 1.0),
    score: 0,
    selected: false,
    extracted: raw.extracted ?? null,
    translation: raw.translation ?? null,
    status: raw.status ?? "pending",
  };
}

function loadCandidates(filePath) {
  const data = JSON.parse(readFileSync(resolve(filePath), "utf8"));
  const list = Array.isArray(data) ? data : (data.candidates ?? data.items ?? data.results ?? []);
  return list.map(normalizeCandidate).filter(Boolean);
}

async function fetchFromSources(options) {
  const sources = normalizeSources(JSON.parse(readFileSync(resolve(options.sources), "utf8")));
  const all = [];
  for (const source of sources) {
    all.push(...(await fetchSource(source)));
  }
  let filtered = all;
  if (options.topic && !options.noFilter) filtered = filterByTopic(filtered, options.topic);
  if (options.lang) filtered = filtered.filter((item) => item.lang === options.lang);
  if (options.country) filtered = filtered.filter((item) => item.country === options.country);
  const unique = dedup(filtered);
  return unique.map(normalizeCandidate).filter(Boolean);
}

export async function run(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (!options.topic && !options.candidates && !options.sources) {
    console.error("Usage: node <this-file> --topic <topic> [--country <c>] [--lang <l>] (--sources <file.json> | --candidates <file.json>) [--out <file.json>] [--limit N]");
    process.exitCode = 1;
    return null;
  }

  let candidates;
  if (options.candidates) {
    candidates = loadCandidates(options.candidates);
  } else if (options.sources) {
    candidates = await fetchFromSources(options);
  } else {
    console.error("Provide --candidates or --sources (discovery is an LLM step; no websearch is performed here).");
    process.exitCode = 1;
    return null;
  }

  if (candidates.length === 0) {
    console.error("No candidates to research.");
    process.exitCode = 1;
    return null;
  }

  // Score
  for (const c of candidates) {
    const w = Number.isFinite(c.weight) ? c.weight : 1.0;
    c.score = w * recencyFactor(c.date);
  }
  candidates.sort((a, b) => b.score - a.score);

  // Select top-N
  const limit = Math.max(1, options.limit || 8);
  candidates.forEach((c, idx) => {
    c.selected = idx < limit;
  });

  // Parse selected
  if (options.parse) {
    for (const c of candidates) {
      if (!c.selected) continue;
      try {
        const parsed = await fallback(c.url, { minWords: options.minWords });
        c.extracted = parsed;
        c.status = parsed.status || c.status;
      } catch (e) {
        c.extracted = { error: e.message };
        c.status = "failed";
      }
    }
  }

  const outPath = resolve(
    options.out || `docs/research/${slugify(options.topic || "research-pack")}.json`,
  );
  mkdirSync(dirname(outPath), { recursive: true });

  const pack = {
    topic: options.topic,
    country: options.country,
    targetLang: options.lang,
    generatedAt: new Date().toISOString(),
    candidates,
  };
  writeFileSync(outPath, JSON.stringify(pack, null, 2), "utf8");

  const selectedCount = candidates.filter((c) => c.selected).length;
  console.error(`research pack: ${outPath}`);
  console.error(`candidates: ${candidates.length}, selected: ${selectedCount}`);
  console.error(`suggested slug: ${slugify(options.topic || "research-pack")}`);
  console.error(`genre candidate: research (or media/industry for news)`);
  console.error("note: LLM rerank and translation steps are not automated; see SKILL.md.");
  return pack;
}

if (isEntryPoint(import.meta.url)) {
  await run();
}
