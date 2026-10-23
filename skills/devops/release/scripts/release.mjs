#!/usr/bin/env node
// Release CLI: plan by default, apply on request.
//
// Run from the project root you are releasing. Without `--apply` nothing is
// written, so the agent can show the plan, confirm, and only then execute.

import { resolve } from "node:path";

import { isEntryPoint } from "#lib/cli.mjs";
import { projectRoot } from "#lib/project.mjs";
import { applyRelease, KINDS, planRelease } from "#lib/release/release.mjs";

const USAGE = `Usage:
  node <skill>/scripts/release.mjs [patch|minor|major] [--plan] [--json] [--root <dir>]
  node <skill>/scripts/release.mjs [patch|minor|major] --apply [--no-push] [--yes] [--json]

Default is --plan: it writes nothing. --apply commits, tags and pushes.
--yes confirms a major release. --root releases a project other than the cwd.`;

function parseArgs(argv) {
  const flags = { kind: "minor", apply: false, json: false, push: true, yes: false, root: null };
  const positional = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") flags.apply = true;
    else if (arg === "--plan" || arg === "--dry-run") flags.apply = false;
    else if (arg === "--json") flags.json = true;
    else if (arg === "--no-push") flags.push = false;
    else if (arg === "--yes" || arg === "-y") flags.yes = true;
    else if (arg === "--root") {
      flags.root = argv[index + 1] ?? null;
      index += 1;
    } else if (arg.startsWith("--root=")) flags.root = arg.slice("--root=".length);
    else if (arg.startsWith("--")) throw new Error(`unknown flag: ${arg}`);
    else positional.push(arg);
  }

  if (positional[0]) flags.kind = positional[0];
  return flags;
}

function printPlan(plan) {
  console.log(
    `release ${plan.from} -> ${plan.to} (${plan.kind}); range ${plan.since ?? "root"}..HEAD; ${plan.commitCount} commit(s)`,
  );
  if (plan.plans.length === 0) {
    console.log("finished plans: none");
  } else {
    console.log(`finished plans to delete (${plan.plans.length}):`);
    for (const file of plan.plans) console.log(`  ${file}`);
  }
  console.log(`\n--- ${plan.files[0]} ---\n`);
  console.log(plan.changelog);
  if (plan.needsConfirmation) console.log("a major release needs --yes with --apply");
  console.log("(plan only, nothing written; rerun with --apply)");
}

function fail(message) {
  console.error(`release: ${message}`);
  process.exitCode = 1;
}

function main(argv) {
  let flags;
  try {
    flags = parseArgs(argv);
  } catch (error) {
    fail(`${error.message}\n\n${USAGE}`);
    return;
  }

  if (!KINDS.includes(flags.kind)) {
    fail(`unknown bump "${flags.kind}" (expected ${KINDS.join(", ")})`);
    return;
  }

  const root = flags.root ? resolve(flags.root) : projectRoot();
  const plan = planRelease(flags.kind, { root });
  if (!plan.ok) {
    fail(plan.error ?? "the release cannot run");
    return;
  }

  if (!flags.apply) {
    if (flags.json) console.log(JSON.stringify(plan, null, 2));
    else printPlan(plan);
    return;
  }

  if (plan.needsConfirmation && !flags.yes) {
    fail("a major release needs --yes (confirm with the user first)");
    return;
  }

  const result = applyRelease(plan, { push: flags.push });
  if (flags.json) console.log(JSON.stringify(result, null, 2));
  else console.log(`released ${result.tag}${result.pushed ? ", pushed branch and tag" : ", tag only"}`);
}

if (isEntryPoint(import.meta.url)) {
  main(process.argv.slice(2));
}
