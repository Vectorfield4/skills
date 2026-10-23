// The release number in the project manifest: read, rewrite, detect a staged bump.
//
// Only the `version` field changes; the rest of package.json stays byte for byte,
// so a release commit shows one line in the diff.

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { versionStaged } from "../git.mjs";
import { parseVersion } from "../semver.mjs";

/** The current version string. */
export function readVersion(root, manifest = "package.json") {
  return JSON.parse(readFileSync(join(root, manifest), "utf8")).version;
}

/** Rewrite only the `version` field. */
export function writeVersion(root, version, manifest = "package.json") {
  parseVersion(version);
  const path = join(root, manifest);
  const raw = readFileSync(path, "utf8");
  const next = raw.replace(/("version":\s*")\d+\.\d+\.\d+(")/, `$1${version}$2`);
  if (next === raw) throw new Error(`no \`version\` field in ${path}`);
  writeFileSync(path, next, "utf8");
  return version;
}

/** True when the staged manifest already carries the number (a release commit). */
export function isVersionStaged(root, manifest = "package.json") {
  return versionStaged({ cwd: root, manifest });
}
