// Writes many answers into a precedent questionnaire at once. The input is a
// JSON file mapping field paths to values; all entries are applied in one pass
// so the file is written once and comments are preserved.
//
//   node apply-answers.mjs --file q.yaml --answers answers.json
//
// Exit codes: 0 written, 1 nothing changed, 2 error.

import { readFileSync, writeFileSync } from "node:fs";

import { isEntryPoint, parseFlags, wantsHelp } from "#lib/cli.mjs";
import { parseYamlWithLines } from "#lib/yaml/parse.mjs";

const USAGE = `apply-answers — write many fields of a precedent questionnaire at once

  node apply-answers.mjs --file <yaml> --answers <json> [flags]

Flags
  --file <path>      Questionnaire YAML. Required.
  --answers <path>   JSON file: { "path": value, ... }. Use "-" for stdin.
  --raw              Treat every value as raw YAML.

Exit codes: 0 written, 1 nothing changed, 2 error.
`;

const FLAG_SPEC = { file: "string", answers: "string", raw: "boolean" };

function renderValue(raw, asRaw) {
  if (asRaw) return String(raw);
  if (raw === null) return "null";
  if (typeof raw === "boolean") return raw ? "true" : "false";
  if (typeof raw === "number") return String(raw);
  const text = String(raw);
  if (text === "null") return "null";
  if (text === "true" || text === "false") return text;
  if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(text)) return text;
  if (text.startsWith('"') && text.endsWith('"')) return text;
  if (text.startsWith("'") && text.endsWith("'")) return text;
  return `"${text.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

async function main() {
  const argv = process.argv.slice(2);
  if (wantsHelp(argv)) {
    process.stdout.write(`${USAGE}\n`);
    return 0;
  }

  let flags;
  try {
    flags = parseFlags(argv, FLAG_SPEC);
  } catch (error) {
    process.stderr.write(`${error.message}\n\n${USAGE}`);
    return 2;
  }

  if (!flags.file || !flags.answers) {
    process.stderr.write(`--file and --answers are required\n\n${USAGE}`);
    return 2;
  }

  let text;
  try {
    text = readFileSync(flags.file, "utf8");
  } catch (error) {
    process.stderr.write(`cannot read ${flags.file}: ${error.message}\n`);
    return 2;
  }

  let answers;
  try {
    const raw = flags.answers === "-" ? readFileSync(0, "utf8") : readFileSync(flags.answers, "utf8");
    answers = JSON.parse(raw);
  } catch (error) {
    process.stderr.write(`cannot read answers: ${error.message}\n`);
    return 2;
  }

  if (!answers || typeof answers !== "object" || Array.isArray(answers)) {
    process.stderr.write(`answers must be a JSON object { "path": value }\n`);
    return 2;
  }

  const { lines } = parseYamlWithLines(text);
  const rawLines = text.split(/\r?\n/);
  let changed = 0;

  for (const [pathKey, value] of Object.entries(answers)) {
    const lineNo = lines.get(pathKey);
    if (!lineNo) {
      process.stderr.write(`warning: path "${pathKey}" not found, skipping\n`);
      continue;
    }
    const index = lineNo - 1;
    const original = rawLines[index];
    const match = original.match(/^(\s*[\w.[\]]+\s*:\s*)(.*?)(\s*(?:#.*)?)$/) ||
      original.match(/^(\s*-\s+)(.*?)(\s*(?:#.*)?)$/);
    if (!match) {
      process.stderr.write(`warning: cannot parse line ${lineNo}: "${original}"\n`);
      continue;
    }
    const rendered = renderValue(value, Boolean(flags.raw));
    const updated = `${match[1]}${rendered}${match[3]}`;
    if (updated !== original) {
      rawLines[index] = updated;
      changed += 1;
    }
  }

  if (changed === 0) {
    process.stdout.write("nothing changed\n");
    return 1;
  }

  writeFileSync(flags.file, rawLines.join("\n"), "utf8");
  process.stdout.write(`applied ${changed} answer(s)\n`);
  return 0;
}

if (isEntryPoint(import.meta.url)) {
  main().then(
    (code) => process.exit(code ?? 0),
    (error) => {
      process.stderr.write(`error: ${error?.stack ?? error}\n`);
      process.exit(2);
    },
  );
}
