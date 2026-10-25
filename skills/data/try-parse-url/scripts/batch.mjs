#!/usr/bin/env node
// Batch parse: parse many URLs through the parse-fallback chain.
//
// Run:
//   node <this-file> --file candidates.json [--out-dir docs/research/generated] [--min-words 80]
//   node <this-file> --urls urls.txt [--out-dir docs/research/generated]
//
// Writes one <slug>.parsed.json per URL plus a batch.json summary in out-dir.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, basename } from "node:path";
import { isEntryPoint } from "#lib/cli.mjs";
import { fallback } from "../../parse-fallback/scripts/fallback.mjs";

function slugify(raw) {
  const base = String(raw ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return base || "item";
}

function slugFromUrl(url) {
  try {
    const u = new URL(url);
    return slugify(`${u.hostname}${u.pathname}`);
  } catch {
    return slugify(url);
  }
}

function parseArgs(argv) {
  const options = {
    file: null,
    urls: null,
    outDir: null,
    minWords: 80,
    concurrency: 1,
    delayMs: 0,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--file") options.file = argv[++i];
    else if (arg === "--urls") options.urls = argv[++i];
    else if (arg === "--out-dir" || arg === "--outDir") options.outDir = argv[++i];
    else if (arg === "--min-words") options.minWords = Number(argv[++i]) || 80;
    else if (arg === "--concurrency") options.concurrency = Math.max(1, Number(argv[++i]) || 1);
    else if (arg === "--delay" || arg === "--delay-ms") options.delayMs = Number(argv[++i]) || 0;
    else if (!arg.startsWith("--") && !options.file && !options.urls) {
      // positional: treat as urls file if it ends in .txt, else candidates file
      if (arg.endsWith(".txt")) options.urls = arg;
      else options.file = arg;
    }
  }
  return options;
}

function loadFromFile(filePath) {
  const raw = readFileSync(resolve(filePath), "utf8");
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    // treat as one URL per line
    return raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((url) => ({ url }));
  }
  const list = Array.isArray(data)
    ? data
    : data.candidates ?? data.items ?? data.results ?? data.urls ?? [];
  return list
    .map((entry) => (typeof entry === "string" ? { url: entry } : entry))
    .filter((entry) => entry && entry.url);
}

function loadFromUrls(filePath) {
  const raw = readFileSync(resolve(filePath), "utf8");
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((url) => ({ url }));
}

function uniquePath(dir, slug) {
  let candidate = resolve(dir, `${slug}.parsed.json`);
  if (!existsSync(candidate)) return candidate;
  let i = 2;
  while (existsSync(resolve(dir, `${slug}-${i}.parsed.json`))) i++;
  return resolve(dir, `${slug}-${i}.parsed.json`);
}

async function sleep(ms) {
  if (ms > 0) await new Promise((r) => setTimeout(r, ms));
}

/** Which methods the chain actually tried across the run, and how they fared. */
function summarizeAttempts(results) {
  const out = {};
  for (const r of results) {
    for (const a of r.attempts ?? []) {
      if (!a?.method) continue;
      const rec = (out[a.method] ??= { tried: 0, ok: 0, failed: 0, errors: [] });
      rec.tried++;
      if (a.ok) rec.ok++;
      else {
        rec.failed++;
        if (a.error && rec.errors.length < 3 && !rec.errors.includes(a.error)) rec.errors.push(a.error);
      }
    }
  }
  return out;
}

export async function runBatch(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (!options.file && !options.urls) {
    console.error("Usage: node <this-file> --file <candidates.json> | --urls <urls.txt> [--out-dir <dir>] [--min-words N]");
    process.exitCode = 1;
    return null;
  }

  const candidates = options.file
    ? loadFromFile(options.file)
    : loadFromUrls(options.urls);

  if (candidates.length === 0) {
    console.error("No URLs to parse.");
    process.exitCode = 1;
    return null;
  }

  const outDir = resolve(options.outDir || "docs/research/generated");
  mkdirSync(outDir, { recursive: true });

  const results = [];
  const usedSlugs = new Set();

  async function processOne(candidate, index) {
    const url = candidate.url;
    const originalSourceUrl =
      candidate.originalSourceUrl || candidate.originalSource || candidate.sourceUrl || null;
    await sleep(options.delayMs);
    let parsed;
    try {
      parsed = await fallback(url, { originalSourceUrl, minWords: options.minWords });
    } catch (e) {
      parsed = {
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
        error: `batch error: ${e.message}`,
        fallback: "manual",
        attempts: [],
      };
    }

    let slug = slugFromUrl(url);
    if (usedSlugs.has(slug)) {
      let i = 2;
      while (usedSlugs.has(`${slug}-${i}`)) i++;
      slug = `${slug}-${i}`;
    }
    usedSlugs.add(slug);
    const outPath = uniquePath(outDir, slug);
    writeFileSync(outPath, JSON.stringify(parsed, null, 2), "utf8");

    const summary = {
      index: index + 1,
      url,
      title: parsed.title ?? null,
      file: outPath,
      status: parsed.status,
      method: parsed.method,
      wordCount: parsed.wordCount ?? 0,
      error: parsed.error ?? null,
      attempts: parsed.attempts ?? [],
      attemptedMethods: [...new Set((parsed.attempts ?? []).map((a) => a.method).filter(Boolean))],
    };
    results.push(summary);
    console.error(`[${index + 1}/${candidates.length}] ${parsed.status} ${parsed.method} ${parsed.wordCount}w ${url}`);
    return summary;
  }

  // sequential (default) or simple concurrency
  if (options.concurrency <= 1) {
    for (let i = 0; i < candidates.length; i++) {
      await processOne(candidates[i], i);
    }
  } else {
    const queue = candidates.map((c, i) => ({ c, i }));
    const workers = Array.from({ length: options.concurrency }, async () => {
      while (queue.length) {
        const { c, i } = queue.shift();
        await processOne(c, i);
      }
    });
    await Promise.all(workers);
    // restore order
    results.sort((a, b) => a.index - b.index);
  }

  const batchPath = resolve(outDir, "batch.json");
  const batch = {
    generatedAt: new Date().toISOString(),
    total: candidates.length,
    ok: results.filter((r) => r.status === "ok").length,
    failed: results.filter((r) => r.status !== "ok").length,
    attemptsByMethod: summarizeAttempts(results),
    results,
  };
  writeFileSync(batchPath, JSON.stringify(batch, null, 2), "utf8");
  console.error(`Wrote ${results.length} parsed files + ${batchPath}`);
  console.error(`ok=${batch.ok} failed=${batch.failed}`);
  return batch;
}

if (isEntryPoint(import.meta.url)) {
  await runBatch();
}
