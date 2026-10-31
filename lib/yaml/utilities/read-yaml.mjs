// Reads a hand-filled YAML domain file and checks it against its TypeScript
// contract. One command, three outcomes: the document as JSON on stdout, a
// validation report, or a non-zero exit with the offending line.
//
//   node lib/yaml/utilities/read-yaml.mjs \
//     -type=content/precedent-questionnaire \
//     -file=data/content/precedent-questionnaire.yaml
//
// `-type` is either a path to a `.ts` file or a domain path inside the skills
// repo `lib/` (`content/precedent-questionnaire`). Single-dash and double-dash
// flags are equivalent so PowerShell and bash wrappers read the same.
//
// Exit codes: 0 valid, 1 schema violations, 2 broken YAML, type or arguments.

import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { isEntryPoint, parseFlags, wantsHelp } from "#lib/cli.mjs";
import { YamlError, parseYamlWithLines } from "#lib/yaml/parse.mjs";
import { TypeParseError, parseTypeScript, resolveEntry } from "#lib/yaml/typescript.mjs";
import { validateDocument } from "#lib/yaml/validate.mjs";

const LIB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const USAGE = `read-yaml — validate a YAML domain file against its TypeScript contract

  node read-yaml.mjs -type=<domain/name|path/to/type.ts> [-file=<path>] [flags]

Flags
  -type, --type        Contract: "content/precedent-questionnaire" (lib/<domain>/<name>.ts)
                       or a path to a .ts file. Required unless --no-validate.
  -file, --file        YAML to read. Default "-" (stdin).
  --entry              Entry interface when the file declares more than one root.
  --report             Print the validation report instead of the document.
  --strict             Unknown fields and null-where-not-allowed become errors.
  --allow-unknown      Downgrade unknown fields to warnings (default without --strict).
  --no-validate        Convert YAML to JSON only; --type is then optional.
  --pretty             Indented JSON output.
  --quiet              No summary on stderr.
  --lib                Override the skills repo lib/ root used to resolve --type.

Exit codes
  0  valid          1  schema violations          2  broken YAML, type or arguments
`;

const FLAG_SPEC = {
  type: "string",
  file: "string",
  entry: "string",
  report: "boolean",
  strict: "boolean",
  "allow-unknown": "boolean",
  "no-validate": "boolean",
  pretty: "boolean",
  quiet: "boolean",
  lib: "string",
};

/** Accepts `-type=x` as well as `--type=x`; the parser only knows the long form. */
export function normalizeFlags(argv) {
  return argv.map((arg) => {
    const match = /^-([a-zA-Z][\w-]*)(=.*)?$/.exec(arg);
    return match ? `--${match[1]}${match[2] ?? ""}` : arg;
  });
}

/** Resolves `-type` to a real `.ts` file: a path first, then the lib root. */
export function resolveTypeFile(spec, options = {}) {
  if (!spec) return null;
  const cwd = options.cwd ?? process.cwd();
  const libRoot = options.libRoot ?? LIB_ROOT;
  const direct = path.resolve(cwd, spec);
  const candidates = [direct, `${direct}.ts`, path.join(libRoot, `${spec}.ts`), path.join(libRoot, spec)];
  for (const candidate of candidates) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  throw new Error(`type contract not found for "${spec}"; tried:\n  ${candidates.join("\n  ")}`);
}

/** Parses the contract and picks its entry interface. */
export function loadSchema(typeFile, options = {}) {
  const source = readFileSync(typeFile, "utf8");
  const parsed = parseTypeScript(source, { file: typeFile });
  const entry = resolveEntry(parsed, { entry: options.entry });
  return { ...parsed, entry };
}

/**
 * Programmatic entry point for other scripts: read, parse, validate.
 * Returns `{ file, type, entry, value, lines, validation }`.
 */
export function readYaml(options = {}) {
  const { file = "-", type = null, entry = null, strict = false, allowUnknown = false, validate = true, libRoot } = options;

  let text;
  if (file === "-") text = readFileSync(0, "utf8");
  else {
    if (!existsSync(file)) throw new Error(`file not found: ${file}`);
    text = readFileSync(file, "utf8");
  }

  const { value, lines } = parseYamlWithLines(text);

  if (!validate) return { file, type: null, entry: null, value, lines, validation: null };

  const typeFile = resolveTypeFile(type, { libRoot });
  if (!typeFile) throw new Error("--type is required unless --no-validate is passed");
  const schema = loadSchema(typeFile, { entry });
  const validation = validateDocument(value, schema, { lines, strict, allowUnknown });
  return { file, type: typeFile, entry: schema.entry, value, lines, validation };
}

function formatFindings(findings) {
  return findings.map((item) => {
    const where = item.line ? `line ${item.line}` : "line ?";
    return `  ${where}  ${item.path}: ${item.message}`;
  });
}

async function main() {
  const argv = process.argv.slice(2);
  if (wantsHelp(argv)) {
    process.stdout.write(`${USAGE}\n`);
    return 0;
  }

  let flags;
  try {
    flags = parseFlags(normalizeFlags(argv), FLAG_SPEC);
  } catch (error) {
    process.stderr.write(`${error.message}\n\n${USAGE}`);
    return 2;
  }

  const validate = !flags["no-validate"];
  if (validate && !flags.type) {
    process.stderr.write(`--type is required unless --no-validate is passed\n\n${USAGE}`);
    return 2;
  }

  let result;
  try {
    result = readYaml({
      file: flags.file ?? "-",
      type: flags.type ?? null,
      entry: flags.entry ?? null,
      strict: Boolean(flags.strict),
      allowUnknown: Boolean(flags["allow-unknown"]),
      validate,
      libRoot: flags.lib ? path.resolve(flags.lib) : undefined,
    });
  } catch (error) {
    if (error instanceof YamlError || error instanceof TypeParseError) {
      process.stderr.write(`yaml: ${error.message}\n`);
      return 2;
    }
    process.stderr.write(`error: ${error.message}\n`);
    return 2;
  }

  const json = JSON.stringify(flags.report ? reportOf(result) : result.value, null, flags.pretty ? 2 : undefined);
  process.stdout.write(`${json}\n`);

  const validation = result.validation;
  if (!flags.quiet && validation && !flags.report) {
    const summary = [
      `type ${path.relative(process.cwd(), result.type) || result.type}`,
      `entry ${result.entry}`,
      `completeness ${Math.round(validation.completeness.ratio * 100)}% (${validation.completeness.filled}/${validation.completeness.total})`,
    ];
    process.stderr.write(`${summary.join(" | ")}\n`);
  }

  if (!validation) return 0;
  if (!flags.quiet) {
    for (const line of formatFindings(validation.errors)) process.stderr.write(`error ${line.trim()}\n`);
    for (const line of formatFindings(validation.warnings)) process.stderr.write(`warn  ${line.trim()}\n`);
  }
  return validation.ok ? 0 : 1;
}

function reportOf(result) {
  const validation = result.validation;
  return {
    file: result.file === "-" ? null : result.file,
    type: result.type,
    entry: result.entry,
    ok: validation ? validation.ok : null,
    errors: validation ? validation.errors : [],
    warnings: validation ? validation.warnings : [],
    completeness: validation ? validation.completeness : null,
  };
}

if (isEntryPoint(import.meta.url)) {
  main().then(
    (code) => process.exit(code),
    (error) => {
      process.stderr.write(`error: ${error?.stack ?? error}\n`);
      process.exit(2);
    },
  );
}
