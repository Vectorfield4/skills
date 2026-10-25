#!/usr/bin/env node
// Group parse gaps by reason into a parser backlog.
//
// Before proposing anything, scan the chain (skills/data/*/scripts/*.mjs and
// lib/*.mjs) for an implementation that already covers the failure reason. A
// covered reason becomes "extend the existing parser", never a duplicate.

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { isEntryPoint } from "#lib/cli.mjs";
import { CAPABILITIES, defaultRoot, proposalFor, scanParsers } from "#lib/parse-catalog.mjs";

function domainOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "unknown";
  }
}

function recordAttempt(group, attempt) {
  if (!attempt?.method) return;
  let rec = group.attempts.find((a) => a.method === attempt.method);
  if (!rec) {
    rec = { method: attempt.method, ok: 0, failed: 0, errors: [] };
    group.attempts.push(rec);
  }
  if (attempt.ok) rec.ok++;
  else {
    rec.failed++;
    if (attempt.error && rec.errors.length < 3 && !rec.errors.includes(attempt.error)) {
      rec.errors.push(attempt.error);
    }
  }
}

/** One group per failure reason; domains and attempts are folded in. */
function groupByReason(gaps) {
  const groups = new Map();
  for (const gap of gaps?.gaps ?? []) {
    const reason = gap.reason ?? "unknown";
    let entry = groups.get(reason);
    if (!entry) {
      entry = {
        reason,
        count: 0,
        domains: [],
        examples: [],
        attempts: [],
        priority: 0,
      };
      groups.set(reason, entry);
    }
    entry.count++;

    const domain = domainOf(gap.url);
    let bucket = entry.domains.find((d) => d.domain === domain);
    if (!bucket) {
      bucket = { domain, count: 0, examples: [] };
      entry.domains.push(bucket);
    }
    bucket.count++;
    if (bucket.examples.length < 3) bucket.examples.push(gap.url);
    if (entry.examples.length < 5) entry.examples.push(gap.url);

    for (const attempt of gap.attempts ?? []) recordAttempt(entry, attempt);
  }

  // Older parse-gaps.json files carry the aggregate but no per-gap attempts.
  for (const entry of groups.values()) {
    if (entry.attempts.length > 0) continue;
    const seeded = gaps?.attemptedByReason?.[entry.reason] ?? null;
    for (const [method, counts] of Object.entries(seeded ?? {})) {
      entry.attempts.push({ method, ok: counts.ok ?? 0, failed: counts.failed ?? 0, errors: [] });
    }
  }

  return [...groups.values()];
}

export function review(gaps, minCount = 2, options = {}) {
  const catalog = options.catalog ?? scanParsers(options.root ?? defaultRoot());
  const groups = groupByReason(gaps)
    .map((group) => {
      const reliability = CAPABILITIES[group.reason]?.reliability ?? 1;
      return {
        ...group,
        priority: group.count * reliability,
        proposal: proposalFor(group.reason, catalog),
      };
    })
    .filter((group) => group.count >= minCount)
    .sort((a, b) => b.priority - a.priority || b.count - a.count || a.reason.localeCompare(b.reason));

  return { catalog, groups };
}

function triedLine(group) {
  if (group.attempts.length === 0) {
    return "Tried: not recorded (batch.json predates `attempts`)";
  }
  return `Tried: ${group.attempts
    .map((a) => `${a.method} (${a.ok} ok / ${a.failed} failed)`)
    .join(", ")}`;
}

function renderGroup(group) {
  const p = group.proposal;
  const lines = [`### ${group.reason} — ${group.count} failure(s)`, ""];
  lines.push(`- Cause: ${p.capability}`);
  lines.push(`- Priority: ${group.priority} (count × reliability)`);
  lines.push(`- ${triedLine(group)}`);

  const errors = [...new Set(group.attempts.flatMap((a) => a.errors))];
  if (errors.length > 0) lines.push(`- Observed errors: ${errors.join(" | ")}`);

  lines.push(`- Already implemented: ${p.alreadyImplemented ? "true" : "false"}`);
  if (p.coveredBy.length > 0) {
    const covered = p.coveredBy
      .map((c) => `\`${c.file}\` → \`${c.function ?? "module-level"}\` (${c.capability})`)
      .join(", ");
    lines.push(`- Covered by: ${covered}`);
  }
  if (p.uncovered.length > 0) {
    lines.push(`- Still missing: ${p.uncovered.map((c) => `${c.capability} (${c.summary})`).join(", ")}`);
  }
  lines.push(`- Action: ${p.action}`);
  lines.push(`- Domains: ${group.domains.map((d) => `${d.domain} (${d.count})`).join(", ")}`);
  lines.push("", "Examples:");
  for (const url of group.examples) lines.push(`- ${url}`);
  lines.push("");
  return lines;
}

function render(catalog, groups) {
  const actionable = groups.filter((g) => g.proposal.disposition !== "no-parser");
  const noParser = groups.filter((g) => g.proposal.disposition === "no-parser");

  const lines = ["# Parser backlog", "", `Generated: ${new Date().toISOString()}`, ""];

  lines.push("## Existing parsers scanned", "");
  lines.push(`Scanned ${catalog.files.length} script(s) under \`skills/data\` and \`lib\`.`);
  lines.push("");
  const evidence = catalog.files.filter((f) => f.capabilities.length > 0);
  if (evidence.length === 0) {
    lines.push("_No parse implementation found._");
  } else {
    for (const file of evidence) {
      const caps = [...new Map(file.capabilities.map((c) => [c.id, c])).values()]
        .map((c) => `${c.id}${c.symbol ? ` via ${c.symbol}()` : ""}`)
        .join(", ");
      const fns = file.functions.length > 0 ? file.functions.map((f) => `${f}()`).join(", ") : "—";
      lines.push(`- \`${file.file}\` — ${fns} — covers: ${caps}`);
    }
  }
  lines.push("");

  lines.push("## Proposals", "");
  if (actionable.length === 0) {
    lines.push("_No recurring parse gaps need a parser._", "");
  } else {
    for (const group of actionable) lines.push(...renderGroup(group));
  }

  if (noParser.length > 0) {
    lines.push("## No parser needed", "");
    for (const group of noParser) {
      lines.push(`- **${group.reason}** (${group.count}): ${group.proposal.action}`);
      lines.push(`  ${triedLine(group)}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

/** The machine-readable handoff: same data, one boolean per proposal. */
export function toJson(catalog, groups) {
  return {
    generatedAt: new Date().toISOString(),
    scanned: catalog.files.map((f) => ({
      file: f.file,
      functions: f.functions,
      methods: f.methods,
      sources: f.sources,
      covers: [...new Set(f.capabilities.map((c) => c.id))],
    })),
    proposals: groups.map((g) => ({
      reason: g.reason,
      count: g.count,
      priority: g.priority,
      domains: g.domains.map((d) => d.domain),
      attemptedMethods: g.attempts.map((a) => a.method),
      ...g.proposal,
    })),
  };
}

function parseArgs(argv) {
  const o = { gaps: null, out: null, jsonOut: null, minCount: 2, root: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--gaps") o.gaps = argv[++i];
    else if (argv[i] === "--out") o.out = argv[++i];
    else if (argv[i] === "--json-out" || argv[i] === "--jsonOut") o.jsonOut = argv[++i];
    else if (argv[i] === "--min-count") o.minCount = Number(argv[++i]) || 2;
    else if (argv[i] === "--root") o.root = argv[++i];
  }
  return o;
}

export async function run(argv = process.argv.slice(2)) {
  const o = parseArgs(argv);
  if (!o.gaps) {
    console.error(
      "Usage: node review.mjs --gaps <parse-gaps.json> [--out parser-backlog.md] [--json-out parser-backlog.json] [--min-count 2] [--root <skills repo>]",
    );
    process.exitCode = 1;
    return null;
  }
  const gaps = JSON.parse(readFileSync(resolve(o.gaps), "utf8"));
  const { catalog, groups } = review(gaps, o.minCount, { root: o.root ? resolve(o.root) : undefined });
  const md = render(catalog, groups);
  const outPath = resolve(o.out || "parser-backlog.md");
  writeFileSync(outPath, md, "utf8");
  console.log(`Wrote ${groups.length} backlog group(s) -> ${outPath}`);
  if (o.jsonOut) {
    writeFileSync(resolve(o.jsonOut), JSON.stringify(toJson(catalog, groups), null, 2), "utf8");
    console.log(`Wrote ${resolve(o.jsonOut)}`);
  }
  return groups;
}

if (isEntryPoint(import.meta.url)) {
  await run();
}
