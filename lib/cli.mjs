// Entry-point detection that survives symlinks.
//
// ESM resolves symlinks in `import.meta.url` (the real path) while `process.argv[1]`
// keeps the path the user typed — and skills are mounted as symlinked category dirs, so
// `.opencode/skills/<category>/...` is exactly such a typed path. Comparing URLs directly
// makes the CLI silently do nothing. Compare realpaths instead.

import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

export function isEntryPoint(moduleUrl, argv = process.argv) {
  if (!argv[1]) return false;
  try {
    return realpathSync(argv[1]) === realpathSync(fileURLToPath(moduleUrl));
  } catch {
    return false;
  }
}

/**
 * `--help` never reaches `parseFlags`, which throws on any flag outside its spec.
 * Call this first, print the script's usage block and return, so asking for help
 * exits 0 instead of failing as a typo.
 */
export function wantsHelp(argv) {
  return argv.includes("--help");
}

/**
 * Minimal flag parser: `spec` maps every accepted flag to "boolean", "string" or
 * "number". Both `--flag=value` and `--flag value` work. Positional arguments
 * land in `_`. An unknown flag throws, so a typo never silently does nothing.
 */
export function parseFlags(argv, spec) {
  const out = { _: [] };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      out._.push(arg);
      continue;
    }
    const equals = arg.indexOf("=");
    const name = equals === -1 ? arg.slice(2) : arg.slice(2, equals);
    const type = spec[name];
    if (!type) throw new Error(`unknown flag: --${name}`);
    if (type === "boolean") {
      out[name] = true;
      continue;
    }
    const raw = equals === -1 ? argv[(index += 1)] : arg.slice(equals + 1);
    if (raw === undefined) throw new Error(`--${name} needs a value`);
    if (type === "number") {
      out[name] = Number(raw);
      if (Number.isNaN(out[name])) throw new Error(`--${name} must be a number`);
    } else {
      out[name] = raw;
    }
  }

  return out;
}

