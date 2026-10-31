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
 * Rewrites a single-dash long flag (`-type=content/x`, `-file a.yaml`) into the
 * double-dash form `parseFlags` understands. Short flags (`-y`) and negative
 * numbers (`-1`) are left alone, so an existing CLI keeps its meaning.
 *
 * Utilities accept both spellings because PowerShell callers type `-Flag value`
 * and bash callers type `--flag=value`.
 */
export function normalizeDashes(argv) {
  return (argv ?? []).map((arg) => {
    if (typeof arg !== "string") return arg;
    if (!arg.startsWith("-") || arg.startsWith("--")) return arg;
    const name = arg.slice(1).split("=")[0];
    if (name.length < 2 || /^\d/.test(name)) return arg;
    return `-${arg}`;
  });
}

/** Usage as one string, whether the caller passed a line or an array. */
export function usageText(usage) {
  return [].concat(usage ?? []).join("\n");
}

/**
 * The one stdout channel of a utility: a single JSON document and nothing else.
 * Logs go to stderr through `logLine`, so `| ConvertFrom-Json` and `| jq` never
 * see a progress message.
 */
export function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

/** A human line that must not pollute a utility's JSON stdout. */
export function logLine(text) {
  process.stderr.write(`${text}\n`);
}

/**
 * Runs a read-only utility body with the house contract:
 *
 * - `--help` prints usage to stdout and returns 0;
 * - a flag outside `spec` prints the error plus usage to stderr and returns 2;
 * - no arguments at all is a usage error unless `allowEmpty`;
 * - a throw is one stderr line and exit 2, never a stack trace;
 * - `main(flags)` returns the exit code, or a falsy value for 0.
 *
 * The caller keeps the `isEntryPoint` check, so the same module stays importable
 * from a test and from a skill shim.
 */
export async function runUtility({ usage, spec = {}, main, argv = process.argv.slice(2), allowEmpty = false }) {
  const args = normalizeDashes(argv);

  if (wantsHelp(args)) {
    process.stdout.write(`${usageText(usage)}\n`);
    return 0;
  }

  let flags;
  try {
    flags = parseFlags(args, spec);
  } catch (error) {
    logLine(`${error.message}\n\n${usageText(usage)}`);
    return 2;
  }

  if (!allowEmpty && flags._.length === 0 && Object.keys(flags).length === 1) {
    logLine(usageText(usage));
    return 2;
  }

  try {
    const code = await main(flags);
    return Number.isFinite(code) ? code : 0;
  } catch (error) {
    logLine(`${error?.message ?? error}`);
    return 2;
  }
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

