#!/usr/bin/env node
// Classify failed parses from batch.json and suggest a fallback.

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { isEntryPoint } from "#lib/cli.mjs";

function classify(entry) {
  const err = String(entry.error ?? "").toLowerCase();
  const fb = String(entry.fallback ?? "").toLowerCase();
  if (/http 403/.test(err)) return "waf-403";
  if (/http 404/.test(err)) return "not-found";
  if (/http 429/.test(err)) return "rate-limited";
  if (/non-html/.test(err)) return "non-html";
  if (/timeout|timed out/.test(err)) return "timeout";
  if (fb === "google-cache" || /batchexecute|data-n-a-sg|enable javascript/.test(err)) return "js-interstitial";
  if (/too short|readability returned null/.test(err)) return "empty-or-js";
  if (/paywall|subscribe|login/.test(err)) return "paywall";
  return "unknown";
}

function fallbackFor(reason) {
  switch (reason) {
    case "js-interstitial": return "decode-redirect";
    case "waf-403": return "ua-retry";
    case "empty-or-js": return "archive-org";
    case "not-found": return "manual";
    case "rate-limited": return "retry-later";
    case "non-html": return "pdf-extractor";
    case "timeout": return "retry-later";
    case "paywall": return "manual";
    default: return "manual";
  }
}

/** Carry the attempts through unchanged; they are the audit trail of the chain. */
function attemptsOf(entry) {
  return Array.isArray(entry?.attempts)
    ? entry.attempts.map((a) => ({
        method: a?.method ?? "unknown",
        ok: Boolean(a?.ok),
        error: a?.error ?? null,
      }))
    : [];
}

function parseArgs(argv) {
  const o = { batch: null, out: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--batch") o.batch = argv[++i];
    else if (argv[i] === "--out") o.out = argv[++i];
  }
  return o;
}

export function triage(batch) {
  const results = Array.isArray(batch?.results) ? batch.results : [];
  const failed = results.filter((r) => r.status !== "ok");
  const gaps = failed.map((r) => {
    const reason = classify(r);
    const attempts = attemptsOf(r);
    return {
      url: r.url,
      title: r.title ?? null,
      reason,
      suggestedFallback: fallbackFor(reason),
      attemptedMethods: [...new Set(attempts.map((a) => a.method))],
      attempts,
      error: r.error ?? null,
    };
  });
  const byReason = {};
  for (const g of gaps) byReason[g.reason] = (byReason[g.reason] ?? 0) + 1;

  // Which methods the chain already burned for each reason, so the review can
  // say "tried" instead of repeating a dead method.
  const attemptedByReason = {};
  for (const g of gaps) {
    const bucket = (attemptedByReason[g.reason] ??= {});
    for (const a of g.attempts) {
      const rec = (bucket[a.method] ??= { tried: 0, ok: 0, failed: 0 });
      rec.tried++;
      if (a.ok) rec.ok++;
      else rec.failed++;
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    total: results.length,
    failed: gaps.length,
    byReason,
    attemptedByReason,
    gaps,
  };
}

export async function run(argv = process.argv.slice(2)) {
  const o = parseArgs(argv);
  if (!o.batch) {
    console.error("Usage: node triage.mjs --batch <batch.json> [--out parse-gaps.json]");
    process.exitCode = 1;
    return null;
  }
  const batch = JSON.parse(readFileSync(resolve(o.batch), "utf8"));
  const report = triage(batch);
  const outPath = resolve(o.out || "parse-gaps.json");
  writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");
  console.log(`failed=${report.failed}/${report.total} -> ${outPath}`);
  return report;
}

if (isEntryPoint(import.meta.url)) {
  await run();
}