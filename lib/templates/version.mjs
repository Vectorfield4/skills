/**
 * Version — the single source of truth for the release number.
 *
 * The number lives in `package.json` (`version`). This module owns the arithmetic
 * (`patch` / `minor` / `major`), the read/write of the field, and the husky
 * pre-commit path: every commit bumps `patch` unless the staged diff already
 * changes `version` (a release commit, which sets the number itself).
 *
 * Usage:
 *   node scripts/version.mjs get
 *   node scripts/version.mjs bump [patch|minor|major]
 *   node scripts/version.mjs set <x.y.z>
 *   node scripts/version.mjs hook
 */

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/** Repo root. From this file's URL when run by node; from cwd under Vitest. */
function resolveRepoRoot() {
  try {
    return fileURLToPath(new URL("../", import.meta.url));
  } catch {
    return process.cwd();
  }
}

/** Repo root, resolved from this file's location (`<root>/scripts/`). */
export const ROOT = resolveRepoRoot();
/** The manifest that carries the version. */
export const PACKAGE_PATH = join(ROOT, "package.json");

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

/** `"1.2.3"` → `{ major: 1, minor: 2, patch: 3 }`. Throws on anything else. */
export function parseVersion(version) {
  const match = SEMVER.exec(String(version).trim());
  if (!match) throw new Error(`not a semver version: "${version}"`);
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

/** `{ major: 1, minor: 2, patch: 3 }` → `"1.2.3"`. */
export function formatVersion({ major, minor, patch }) {
  return `${major}.${minor}.${patch}`;
}

/**
 * Next version. `major` resets minor and patch; `minor` resets patch; `patch`
 * only increments patch. Every commit is a patch unless the release says more.
 */
export function bumpVersion(version, kind) {
  const { major, minor, patch } = parseVersion(version);
  if (kind === "major") return formatVersion({ major: major + 1, minor: 0, patch: 0 });
  if (kind === "minor") return formatVersion({ major, minor: minor + 1, patch: 0 });
  if (kind === "patch") return formatVersion({ major, minor, patch: patch + 1 });
  throw new Error(`unknown bump kind: "${kind}" (expected patch, minor or major)`);
}

/** The current version string. */
export function readVersion(packagePath = PACKAGE_PATH) {
  return JSON.parse(readFileSync(packagePath, "utf8")).version;
}

/** Rewrite only the `version` field, leaving the rest of the file byte-for-byte. */
export function writeVersion(version, packagePath = PACKAGE_PATH) {
  parseVersion(version);
  const raw = readFileSync(packagePath, "utf8");
  const next = raw.replace(/("version":\s*")\d+\.\d+\.\d+(")/, `$1${version}$2`);
  if (next === raw) throw new Error(`no \`version\` field in ${packagePath}`);
  writeFileSync(packagePath, next, "utf8");
  return version;
}

function git(args) {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" });
}

/** True when the staged `package.json` already changes the `version` field. */
export function versionStaged() {
  try {
    const diff = git(["diff", "--cached", "--", "package.json"]);
    return /^[+-]\s*"version":/m.test(diff);
  } catch {
    return false;
  }
}

/**
 * husky pre-commit: bump `patch` and stage the manifest, unless a release commit
 * already staged the number (so a release is never eaten by the next patch).
 */
export function runHook() {
  if (versionStaged()) {
    console.log("version already staged (release commit) — skipping patch bump");
    return;
  }
  const next = writeVersion(bumpVersion(readVersion(), "patch"));
  git(["add", "package.json"]);
  console.log(`version bumped to ${next}`);
}

const USAGE = `Usage:
  node scripts/version.mjs get
  node scripts/version.mjs bump [patch|minor|major]
  node scripts/version.mjs set <x.y.z>
  node scripts/version.mjs hook`;

function main(argv) {
  const [command, ...rest] = argv;

  if (command === "get") {
    console.log(readVersion());
    return;
  }
  if (command === "bump") {
    console.log(writeVersion(bumpVersion(readVersion(), rest[0] ?? "patch")));
    return;
  }
  if (command === "set") {
    console.log(writeVersion(rest[0] ?? ""));
    return;
  }
  if (command === "hook") {
    runHook();
    return;
  }

  console.error(USAGE);
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
