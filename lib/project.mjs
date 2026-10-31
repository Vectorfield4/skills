// Where the project is, and what it configured.
//
// A skill script runs from inside a project and writes project files, so every
// path it touches is relative to the nearest `package.json` above the working
// directory. The skill's own location is never the project.

import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { readJsonSafe } from "#lib/json.mjs";

/** Nearest ancestor of `start` that carries a `package.json`. */
export function projectRoot(start = process.cwd()) {
  const origin = resolve(start);
  let dir = origin;
  for (;;) {
    if (existsSync(join(dir, "package.json"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return origin;
    dir = parent;
  }
}

/**
 * Parsed JSON, or `fallback` when the file is absent or unreadable. A corrupt
 * config is not a reason to stop a run, so a parse error falls back too.
 */
export function readJsonIfExists(file, fallback = null) {
  try {
    return readJsonSafe(file, fallback);
  } catch {
    return fallback;
  }
}

/** The optional `skills.config.json` at the project root, never null. */
export function readConfig(root, name = "skills.config.json") {
  const config = readJsonIfExists(join(root, name), {});
  return config && typeof config === "object" && !Array.isArray(config) ? config : {};
}
