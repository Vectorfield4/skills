// Generates a fillable YAML questionnaire from a TypeScript contract.
//
// The contract (`lib/<domain>/<name>.ts`) is the only source: its `@question`
// comments become the comments in the YAML file, `@default` pre-fills values,
// `@count` says how many list items to print and `@example` is shown as a
// hint. The generated file is a starting point, not an overwrite: a
// questionnaire that already has content is refused unless --force is passed.

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { isEntryPoint, parseFlags, wantsHelp } from "#lib/cli.mjs";
import { parseTypeScript, resolveEntry, parseDoc } from "#lib/yaml/typescript.mjs";
import { resolveTypeFile } from "#lib/yaml/utilities/read-yaml.mjs";

const LIB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "lib");

const USAGE = `questionnaire — generate a fillable YAML questionnaire from a TypeScript contract

  node questionnaire.mjs --slug=<slug> [flags]

Flags
  --slug <slug>        Page slug, kebab-case. Required.
  --title <text>       Working title for the questionnaire.
  --type <path>        Contract: "content/precedent-questionnaire" or a path to a .ts file.
                       Default "content/precedent-questionnaire".
  --domain <name>      Domain folder under data/ for the output file.
                       Default: the first segment of --type ("content").
  --out <path>         Output YAML file. Default "data/<domain>/precedent-questionnaire.yaml".
  --format <f>         yaml | md | both. Default "yaml".
  --project <path>     Read audiences, services, solutions and cases from a project
                       and print the allowed values as a comment block.
  --force              Overwrite an existing file.
  --entry <name>       Entry interface when the contract declares more than one root.
  --pretty-md          Indented markdown output (default is compact).

Exit codes: 0 written, 1 nothing to do (file exists), 2 error.
`;

const FLAG_SPEC = {
  slug: "string",
  title: "string",
  type: "string",
  domain: "string",
  out: "string",
  format: "string",
  project: "string",
  force: "boolean",
  entry: "string",
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

function resolveType(spec, libRoot) {
  return resolveTypeFile(spec, { libRoot });
}

function loadSchema(typeFile, entry) {
  const source = readFileSync(typeFile, "utf8");
  const parsed = parseTypeScript(source, { file: typeFile });
  const name = resolveEntry(parsed, { entry });
  return { parsed, entry: name };
}

function resolveTypeNode(node, types) {
  if (!node) return node;
  if (node.kind === "ref") {
    const decl = types.get(node.name);
    if (decl?.kind === "interface") return { kind: "object", fields: decl.fields, name: decl.name };
    if (decl?.kind === "alias") return resolveTypeNode(decl.type, types);
  }
  return node;
}

function parseDefault(raw) {
  if (raw === null || raw === undefined) return null;
  const text = String(raw).trim();
  if (text === "null" || text === "~") return null;
  if (text === "true") return true;
  if (text === "false") return false;
  if (/^".*"$/.test(text) || /^'.*'$/.test(text)) return text.slice(1, -1);
  if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(text)) return Number(text);
  return text;
}

function literalValuesOf(node, types) {
  const out = [];
  if (!node) return out;
  if (node.kind === "literal") return [node.value];
  if (node.kind === "union") {
    for (const option of node.options) out.push(...literalValuesOf(option, types));
    return out;
  }
  if (node.kind === "ref") {
    const decl = types.get(node.name);
    if (decl?.kind === "alias") return literalValuesOf(decl.type, types);
    if (decl?.kind === "interface") return [];
  }
  return out;
}

function defaultValue(field, node, types) {
  if (field.doc.default != null) return parseDefault(field.doc.default);
  if (node.kind === "literal") return node.value;
  if (node.kind === "string") return "";
  if (node.kind === "number") return null;
  if (node.kind === "boolean") return null;
  if (node.kind === "union") {
    const values = literalValuesOf(node, types);
    if (values.length > 0) return values[0];
    return null;
  }
  return null;
}

const NUMBER_RE = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;

function renderScalar(value) {
  if (value === null) return "null";
  if (value === true) return "true";
  if (value === false) return "false";
  if (typeof value === "number") return String(value);
  const text = String(value);
  if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(text)) return `"${text}"`;
  if (/^[\p{L}\p{N}_.:/@-]+$/u.test(text) && !/^\d+$/.test(text)) return text;
  return `"${text.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function emitField(field, types, indent, lines, ctx) {
  if (field.optional) return;  // optional fields are skipped; they do not count toward completeness
  const pad = "  ".repeat(indent);
  const node = resolveTypeNode(field.type, types);
  const question = field.doc.question ? `  # ${field.doc.question}` : "";
  const example = field.doc.example ? field.doc.example : "";

  if (node.kind === "object") {
    lines.push(`${pad}${field.name}:${question}`);
    for (const child of node.fields) emitField(child, types, indent + 1, lines, ctx);
    return;
  }

  if (node.kind === "array") {
    const itemNode = resolveTypeNode(node.of, types);
    const itemFields = itemNode.kind === "object" ? itemNode.fields : null;
    const count = field.doc.count === null || field.doc.count === undefined ? (field.optional ? 0 : 1) : field.doc.count;

    if (itemFields) {
      if (count <= 0) {
        lines.push(`${pad}${field.name}: []${question}`);
        return;
      }
      lines.push(`${pad}${field.name}:${question}`);
      for (let i = 0; i < count; i += 1) {
        lines.push(`${pad}  -`);
        for (const child of itemFields) emitField(child, types, indent + 2, lines, ctx);
      }
      return;
    }

    // array of scalars
    if (count <= 0) {
      lines.push(`${pad}${field.name}: []${question}`);
      return;
    }
    lines.push(`${pad}${field.name}:${question}`);
    for (let i = 0; i < count; i += 1) {
      const value = defaultValue({ doc: {}, type: itemNode }, itemNode, types);
      lines.push(`${pad}  - ${renderScalar(value)}${i === 0 && example ? example : ""}`);
    }
    return;
  }

  let value = defaultValue(field, node, types);
  if (ctx.overrides && Object.prototype.hasOwnProperty.call(ctx.overrides, field.name)) {
    value = ctx.overrides[field.name];
  }
  const rendered = renderScalar(value);
  const trailing = [question, example ? `(@example: ${example})` : ""].filter(Boolean).join("  ");
  lines.push(`${pad}${field.name}: ${rendered}${trailing ? `  ${trailing}` : ""}`);
}

function renderMarkdown(schema, types, ctx) {
  const lines = [];
  let counter = 0;
  const walk = (field, indent) => {
    const node = resolveTypeNode(field.type, types);
    const question = field.doc.question || field.name;
    if (node.kind === "object") {
      lines.push(`${"#".repeat(Math.min(indent + 1, 6))} ${field.name}`);
      lines.push("");
      for (const child of node.fields) walk(child, indent + 1);
      return;
    }
    if (node.kind === "array") {
      counter += 1;
      lines.push(`${counter}. ${question}`);
      lines.push("");
      lines.push("___");
      lines.push("");
      lines.push("_(повторите блок, если нужно больше)_");
      lines.push("");
      return;
    }
    counter += 1;
    lines.push(`${counter}. ${question}`);
    lines.push("");
    lines.push("___");
    lines.push("");
  };
  for (const field of schema.fields) walk(field, 1);
  return lines.join("\n");
}

function readProjectValues(projectPath) {
  const result = { audiences: [], services: [], solutions: [], cases: [] };
  if (!projectPath) return result;
  try {
    const audienceSource = readFileSync(path.join(projectPath, "src/shared/i18n/ru/audiences.ts"), "utf8");
    result.audiences = [...audienceSource.matchAll(/^\s*(\w+)\s*:/gm)].map((m) => m[1]);
  } catch {}
  const collectSlugs = (dir) => {
    const out = [];
    try {
      for (const file of readdirSync(dir)) {
        if (!file.endsWith(".ts")) continue;
        const source = readFileSync(path.join(dir, file), "utf8");
        const match = source.match(/slug:\s*"([^"]+)"/);
        if (match) out.push(match[1]);
      }
    } catch {}
    return out;
  };
  result.services = collectSlugs(path.join(projectPath, "src/entities/service/model/fixtures"));
  result.solutions = collectSlugs(path.join(projectPath, "src/entities/solution/model/fixtures"));
  result.cases = collectSlugs(path.join(projectPath, "src/entities/case/model/fixtures"));
  return result;
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

  const slug = flags.slug;
  if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    process.stderr.write(`--slug is required and must be kebab-case\n\n${USAGE}`);
    return 2;
  }

  const typeSpec = flags.type ?? "content/precedent-questionnaire";
  const libRoot = LIB_ROOT;
  let typeFile;
  try {
    typeFile = resolveTypeFile(typeSpec, { libRoot });
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    return 2;
  }

  const { parsed, entry } = loadSchema(typeFile, flags.entry);
  const schema = parsed.types.get(entry);
  if (!schema || schema.kind !== "interface") {
    process.stderr.write(`entry "${entry}" is not an interface\n`);
    return 2;
  }

  const domain = flags.domain ?? typeSpec.split(/[\\/]/)[0];
  const format = flags.format ?? "yaml";
  if (!["yaml", "md", "both"].includes(format)) {
    process.stderr.write(`--format must be yaml, md or both\n`);
    return 2;
  }

  const outPath = flags.out ?? path.join(process.cwd(), "data", domain, "precedent-questionnaire.yaml");
  const overrides = { slug, workingTitle: flags.title ?? "", updatedAt: today(), interviewDate: today() };
  if (!overrides.workingTitle) delete overrides.workingTitle;

  const ctx = { overrides };

  const lines = [];
  const values = readProjectValues(flags.project);
  if (flags.project && (values.audiences.length || values.services.length)) {
    lines.push(`# Допустимые значения из проекта ${flags.project}`);
    if (values.audiences.length) lines.push(`# audiences.*: ${values.audiences.join(", ")}`);
    if (values.services.length) lines.push(`# services.*: ${values.services.join(", ")}`);
    if (values.solutions.length) lines.push(`# solutions.*: ${values.solutions.join(", ")}`);
    if (values.cases.length) lines.push(`# cases.*: ${values.cases.join(", ")}`);
    lines.push("");
  }
  lines.push("# Заполняет маркетинг. Пустая строка или null = «нет данных», не оценка.");
  lines.push("# Вопросы идут после значения, в комментарии.");
  lines.push("");
  for (const field of schema.fields) emitField(field, parsed.types, 0, lines, ctx);
  const yamlText = `${lines.join("\n")}\n`;

  const mdText = renderMarkdown(schema, parsed.types, ctx);

  if (existsSync(outPath) && !flags.force) {
    process.stderr.write(`refusing to overwrite ${outPath}; pass --force\n`);
    return 1;
  }

  mkdirSync(path.dirname(outPath), { recursive: true });

  if (format === "yaml" || format === "both") writeFileSync(outPath, yamlText, "utf8");
  if (format === "md" || format === "both") {
    const mdPath = outPath.replace(/\.yaml$/, ".md");
    writeFileSync(mdPath, `${mdText}\n`, "utf8");
  }

  process.stdout.write(
    JSON.stringify(
      {
        slug,
        type: typeFile,
        entry,
        format,
        files: format === "both" ? [outPath, outPath.replace(/\.yaml$/, ".md")] : [outPath],
        fields: schema.fields.length,
      },
      null,
      2,
    ),
  );
  process.stdout.write("\n");
  return 0;
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
