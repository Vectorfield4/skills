/**
 * commit-msg - enforce the commit prefix on the first meaningful line.
 *
 * Installed as the husky `commit-msg` hook:
 *   node scripts/commit-msg.mjs "$1"
 *
 * Accepted prefixes: the Conventional set below, plus the keys of
 * `commit-convention.json` at the project root. That same file groups the
 * prefixes for the release changelog, so a new prefix is one data edit.
 *
 * This file is installed verbatim. The source of truth is
 * `lib/templates/commit-msg.mjs` in the skills repo, and the `doctor` skill fails
 * when the installed copy drifts. Reinstall from the template, never patch the copy.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/** Prefixes accepted without any project configuration. */
export const CONVENTIONAL_TYPES = [
  "feat",
  "fix",
  "docs",
  "style",
  "refactor",
  "perf",
  "test",
  "build",
  "ci",
  "chore",
  "revert",
];

const SUBJECT = /^(\w+)(?:\(([^)]+)\))?(!)?: .+/;

/** Conventional prefixes plus the project's own, from `commit-convention.json`. */
export function loadConvention(cwd = process.cwd()) {
  const file = join(cwd, "commit-convention.json");
  if (!existsSync(file)) return [...CONVENTIONAL_TYPES];
  try {
    const types = Object.keys(JSON.parse(readFileSync(file, "utf8")).types ?? {});
    return [...new Set([...CONVENTIONAL_TYPES, ...types])];
  } catch {
    return [...CONVENTIONAL_TYPES];
  }
}

/** The first non-empty, non-comment line - the subject git will show. */
export function firstMeaningfulLine(text) {
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    return trimmed;
  }
  return "";
}

/** `null` when valid or exempt; otherwise the human-readable problem. */
export function validateSubject(subject, allowed = CONVENTIONAL_TYPES) {
  if (!subject) return null;
  if (/^merge\b/i.test(subject)) return null;
  if (/^revert\b/i.test(subject)) return null;
  if (/^(fixup|squash)!/i.test(subject)) return null;
  const match = SUBJECT.exec(subject);
  if (!match) return "missing a `type: description` shape";
  if (!allowed.includes(match[1].toLowerCase())) {
    return `unknown prefix "${match[1]}"; use one of ${allowed.join(", ")}`;
  }
  return null;
}

function main(argv) {
  const file = argv[0];
  if (!file) {
    console.error("commit-msg: no message file given");
    process.exit(1);
  }

  const subject = firstMeaningfulLine(readFileSync(file, "utf8"));
  const problem = validateSubject(subject, loadConvention());
  if (!problem) return;

  console.error(`commit-msg: ${problem}`);
  console.error(`  got: ${subject || "(empty)"}`);
  console.error("  form: type(scope): description - e.g. fix(release): tag the version commit");
  process.exit(1);
}

/** True only when this file is the node entrypoint, never when imported. */
function isEntrypoint() {
  try {
    return Boolean(process.argv[1]) && fileURLToPath(import.meta.url) === process.argv[1];
  } catch {
    return false;
  }
}

if (isEntrypoint()) {
  main(process.argv.slice(2));
}
