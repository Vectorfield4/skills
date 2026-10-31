// Collects every empty field of a precedent questionnaire and prints them as a
// single JSON array, so the agent can ask them all at once (bulk) instead of
// one at a time. The agent asks via the question tool, then writes all
// answers with apply-answers.mjs.
//
//   node bulk-questions.mjs --file data/content/precedent-questionnaire.yaml
//
// Exit codes: 0 questions ready, 1 nothing to fill, 2 error.

import { readFileSync, existsSync } from "node:fs";

import { isEntryPoint, parseFlags, wantsHelp } from "#lib/cli.mjs";
import { parseYamlWithLines } from "#lib/yaml/parse.mjs";
import { parseTypeScript, resolveEntry, resolveTypeNode } from "#lib/yaml/typescript.mjs";
import { resolveTypeFile } from "#lib/yaml/utilities/read-yaml.mjs";

const USAGE = `bulk-questions — collect every empty field of a precedent questionnaire

  node bulk-questions.mjs --file <yaml> [flags]

Flags
  --file <path>   Questionnaire YAML. Required.
  --type <path>   Contract. Default "content/precedent-questionnaire".
  --entry <name>  Entry interface.

Exit codes: 0 questions ready, 1 nothing to fill, 2 error.
`;

const FLAG_SPEC = { file: "string", type: "string", entry: "string" };

const SKIP_FIELDS = new Set(["gates", "delta", "schemaVersion", "updatedAt"]);

function isEmpty(value) {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) {
    if (value.length === 0) return true;
    return value.every((item) => (typeof item === "object" && item !== null ? isEmptyObject(item) : isEmpty(item)));
  }
  if (typeof value === "object") return isEmptyObject(value);
  return false;
}

function isEmptyObject(obj) {
  if (obj === null || typeof obj !== "object") return true;
  return Object.values(obj).every((v) => isEmpty(v));
}

function literalValues(node, types) {
  if (!node) return [];
  if (node.kind === "literal") return [node.value];
  if (node.kind === "union") {
    const out = [];
    for (const o of node.options) out.push(...literalValues(o, types));
    return out;
  }
  if (node.kind === "ref") {
    const decl = types.get(node.name);
    if (decl?.kind === "alias") return literalValues(decl.type, types);
  }
  return [];
}

function collectAll(schemaFields, types, value, path, lines, rawLines, out) {
  for (const field of schemaFields) {
    if (SKIP_FIELDS.has(field.name)) continue;
    if (field.optional) continue;
    const childPath = path ? `${path}.${field.name}` : field.name;
    const childValue = value && Object.prototype.hasOwnProperty.call(value, field.name) ? value[field.name] : undefined;
    const node = resolveTypeNode(field.type, types);

    if (node.kind === "object") {
      collectAll(node.fields, types, childValue && typeof childValue === "object" ? childValue : {}, childPath, lines, rawLines, out);
      continue;
    }

    if (node.kind === "array") {
      const itemNode = resolveTypeNode(node.of, types);
      const itemFields = itemNode.kind === "object" ? itemNode.fields : null;
      if (itemFields && Array.isArray(childValue) && childValue.length > 0) {
        for (let i = 0; i < childValue.length; i++) {
          collectAll(itemFields, types, childValue[i] ?? {}, `${childPath}[${i}]`, lines, rawLines, out);
        }
      }
      if (isEmpty(childValue) && !field.optional) {
        out.push(makeQuestion(field, childPath, childValue, node, lines, rawLines));
      }
      continue;
    }

    if (isEmpty(childValue)) {
      out.push(makeQuestion(field, childPath, childValue, node, lines, rawLines));
    }
  }
}

function makeQuestion(field, path, currentValue, node, lines, rawLines) {
  const lineNo = lines.get(path) ?? null;
  const search = lineNo && rawLines ? rawLines[lineNo - 1] : null;
  const allowed = literalValues(node, new Map());
  return {
    path,
    question: field.doc.question || field.name,
    example: field.doc.example || null,
    default: field.doc.default || null,
    type: node.kind,
    allowed: allowed.length > 0 ? allowed : null,
    current: currentValue === undefined ? null : currentValue,
    line: lineNo,
    search,
  };
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

  if (!flags.file) {
    process.stderr.write(`--file is required\n\n${USAGE}`);
    return 2;
  }

  let text;
  try {
    text = readFileSync(flags.file, "utf8");
  } catch (error) {
    process.stderr.write(`cannot read ${flags.file}: ${error.message}\n`);
    return 2;
  }

  const { value, lines } = parseYamlWithLines(text);
  const rawLines = text.split(/\r?\n/);

  const typeSpec = flags.type ?? "content/precedent-questionnaire";
  let typeFile;
  try {
    typeFile = resolveTypeFile(typeSpec, {});
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    return 2;
  }

  const source = readFileSync(typeFile, "utf8");
  const parsed = parseTypeScript(source, { file: typeFile });
  const entry = resolveEntry(parsed, { entry: flags.entry, file: typeFile });
  const schema = parsed.types.get(entry);
  if (!schema || schema.kind !== "interface") {
    process.stderr.write(`entry "${entry}" is not an interface\n`);
    return 2;
  }

  const questions = [];
  collectAll(schema.fields, parsed.types, value ?? {}, "", lines, rawLines, questions);

  if (questions.length === 0) {
    process.stdout.write(`${JSON.stringify({ done: true, total: 0 }, null, 2)}\n`);
    return 1;
  }

  process.stdout.write(`${JSON.stringify({ done: false, total: questions.length, questions }, null, 2)}\n`);
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
