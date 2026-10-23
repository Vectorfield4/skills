// Semver arithmetic for the release number. Pure functions: no IO, no git.
//
// `scripts/version.mjs` installed into a project duplicates this small block on
// purpose: a husky hook cannot import `#lib/*`, because `#lib` resolves through
// this repository's package.json. Doctor compares the installed copy with
// `lib/templates/version.mjs` so the two never drift.

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

/** `"1.2.3"` -> `{ major: 1, minor: 2, patch: 3 }`. Throws on anything else. */
export function parseVersion(version) {
  const match = SEMVER.exec(String(version).trim());
  if (!match) throw new Error(`not a semver version: "${version}"`);
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

/** `{ major: 1, minor: 2, patch: 3 }` -> `"1.2.3"`. */
export function formatVersion({ major, minor, patch }) {
  return `${major}.${minor}.${patch}`;
}

/** Next version. `major` resets minor and patch, `minor` resets patch. */
export function bumpVersion(version, kind) {
  const { major, minor, patch } = parseVersion(version);
  if (kind === "major") return formatVersion({ major: major + 1, minor: 0, patch: 0 });
  if (kind === "minor") return formatVersion({ major, minor: minor + 1, patch: 0 });
  if (kind === "patch") return formatVersion({ major, minor, patch: patch + 1 });
  throw new Error(`unknown bump kind: "${kind}" (expected patch, minor or major)`);
}
