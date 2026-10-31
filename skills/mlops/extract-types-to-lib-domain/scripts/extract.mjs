// Moves TypeScript domain contracts scattered across a project into
// `%skills_repo%/lib/<domain>/*.ts`, so the YAML reader and the questionnaire
// generator read one source of truth instead of a copy.
//
// Dry-run by default: prints the plan, writes nothing. `--write` applies it.

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { isEntryPoint, parseFlags, wantsHelp } from "#lib/cli.mjs";

const SKILLS_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const LIB_ROOT = path.join(SKILLS_ROOT, "lib");

const USAGE = `extract — move TypeScript domain contracts into lib/<domain>/*.ts

  node extract.mjs --from <path> --domain <name> [--write] [--overwrite] [--allow-external] [--json]

Flags
  --from <path>        Directory to scan. Required.
  --domain <name>      Target domain under lib/. Required.
  --write              Apply the plan. Default: dry-run.
  --overwrite          Replace an existing target file.
  --allow-external     Allow --write when --from is outside the skills repo.
                       The source is then copied, not rewritten.
  --json               Machine-readable plan on stdout.

Exit codes: 0 plan printed or applied, 1 conflicts, 2 error.
`;

const FLAG_SPEC = {
  from: "string",
  domain: "string",
  write: "boolean",
  overwrite: "boolean",
  "allow-external": "boolean",
  json: "boolean",
};

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", ".cache", "coverage", "lib"]);

function walkFiles(root) {
  const out = [];
  const visit = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        visit(path.join(dir, entry.name));
      } else if (entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))) {
        out.push(path.join(dir, entry.name));
      }
    }
  };
  visit(root);
  return out;
}

function lineAt(text, offset) {
  return text.slice(0, offset).split("\n").length;
}

function matchBrace(text, openAt) {
  let depth = 0;
  let string = null;
  for (let index = openAt; index < text.length; index += 1) {
    const char = text[index];
    if (string) {
      if (char === "\\") index += 1;
      else if (char === string) string = null;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      string = char;
      continue;
    }
    if (char === "/" && text[index + 1] === "/") {
      const end = text.indexOf("\n", index);
      index = end === -1 ? text.length : end;
      continue;
    }
    if (char === "/" && text[index + 1] === "*") {
      const end = text.indexOf("*/", index + 2);
      index = end === -1 ? text.length : end + 1;
      continue;
    }
    if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function findStatementEnd(text, from) {
  let depth = 0;
  let string = null;
  for (let index = from; index < text.length; index += 1) {
    const char = text[index];
    if (string) {
      if (char === "\\") index += 1;
      else if (char === string) string = null;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      string = char;
      continue;
    }
    if (char === "/" && text[index + 1] === "/") {
      const end = text.indexOf("\n", index);
      index = end === -1 ? text.length : end;
      continue;
    }
    if (char === "{" || char === "(" || char === "[" || char === "<") depth += 1;
    else if (char === "}" || char === ")" || char === "]" || char === ">") depth -= 1;
    if (char === ";" && depth === 0) return index;
    if (char === "\n" && depth === 0) {
      const rest = text.slice(index + 1).trimStart();
      if (rest === "" || /^(export|import|\/\/|\/\*)/.test(rest)) return index;
    }
  }
  return text.length;
}

function leadingDocStart(source, declStart) {
  const lines = source.split("\n");
  let idx = lines.length - 1;
  // find the line index that contains declStart
  let offset = 0;
  let declLineIndex = 0;
  for (let i = 0; i < lines.length; i += 1) {
    if (offset + lines[i].length >= declStart) {
      declLineIndex = i;
      break;
    }
    offset += lines[i].length + 1;
  }
  if (lines[declLineIndex].trim() === "") return declStart;
  const collected = [];
  let i = declLineIndex - 1;
  while (i >= 0) {
    const trimmed = lines[i].trim();
    if (trimmed === "") break;
    if (
      trimmed.startsWith("*") ||
      trimmed.startsWith("//") ||
      trimmed.startsWith("/*") ||
      trimmed.startsWith("*/") ||
      trimmed === "/**"
    ) {
      collected.unshift(lines[i]);
      i -= 1;
    } else {
      break;
    }
  }
  if (collected.length === 0) return declStart;
  let start = 0;
  for (let k = 0; k <= i; k += 1) start += lines[k].length + 1;
  return start;
}

function findDeclarations(source) {
  const decls = [];
  const re = /export\s+(interface|type)\s+([A-Za-z_$][\w$]*)/g;
  let match;
  while ((match = re.exec(source)) !== null) {
    const kind = match[1];
    const name = match[2];
    const declStart = match.index;
    const openBrace = source.indexOf("{", declStart);
    const docStart = leadingDocStart(source, declStart);

    let end;
    if (kind === "interface") {
      if (openBrace === -1) throw new Error(`unterminated interface "${name}"`);
      const close = matchBrace(source, openBrace);
      if (close === -1) throw new Error(`unterminated interface "${name}"`);
      end = close + 1;
    } else {
      const equals = source.indexOf("=", declStart);
      end = findStatementEnd(source, equals + 1) + 1;
    }
    decls.push({ name, kind, docStart, start: declStart, end, text: source.slice(docStart, end).trimEnd() + "\n", line: lineAt(source, declStart) });
    re.lastIndex = end;
  }
  return decls;
}

function kebab(name) {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/_/g, "-")
    .toLowerCase();
}

function isInsideSkillsRepo(fromPath) {
  const resolved = path.resolve(fromPath);
  return resolved === SKILLS_ROOT || resolved.startsWith(`${SKILLS_ROOT}${path.sep}`);
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

  if (!flags.from || !flags.domain) {
    process.stderr.write(`--from and --domain are required\n\n${USAGE}`);
    return 2;
  }

  const fromPath = path.resolve(flags.from);
  if (!existsSync(fromPath) || !statSync(fromPath).isDirectory()) {
    process.stderr.write(`--from must be an existing directory: ${fromPath}\n`);
    return 2;
  }

  const internal = isInsideSkillsRepo(fromPath);
  if (flags.write && !internal && !flags["allow-external"]) {
    process.stderr.write(
      `refusing to write: --from is outside the skills repo (${fromPath}).\n` +
        `Pass --allow-external to copy without rewriting the source.\n`,
    );
    return 2;
  }

  const files = walkFiles(fromPath);
  const plan = [];
  const seenNames = new Map();
  const duplicates = [];

  for (const file of files) {
    let source;
    try {
      source = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    let decls;
    try {
      decls = findDeclarations(source);
    } catch (error) {
      process.stderr.write(`skip ${file}: ${error.message}\n`);
      continue;
    }
    if (decls.length === 0) continue;

    const target = path.join(LIB_ROOT, flags.domain, `${kebab(path.basename(file, path.extname(file)))}.ts`);
    const targetExists = existsSync(target);
    const names = decls.map((decl) => decl.name);

    for (const name of names) {
      if (seenNames.has(name)) duplicates.push({ name, first: seenNames.get(name), second: file });
      else seenNames.set(name, file);
    }

    let action = "move";
    if (targetExists && !flags.overwrite) action = "conflict";
    plan.push({ source: file, target, names, action, targetExists });
  }

  const conflicts = plan.filter((item) => item.action === "conflict");
  const hasDuplicates = duplicates.length > 0;

  if (flags.json) {
    process.stdout.write(`${JSON.stringify({ from: fromPath, domain: flags.domain, internal, files: plan, duplicates, conflicts: conflicts.map((c) => c.target) }, null, 2)}\n`);
  } else {
    process.stdout.write(`extract plan: ${plan.length} source file(s), domain "${flags.domain}"\n`);
    for (const item of plan) {
      process.stdout.write(`  ${item.action.padEnd(8)} ${path.relative(fromPath, item.source)} -> ${path.relative(SKILLS_ROOT, item.target)} (${item.names.join(", ")})\n`);
    }
    if (duplicates.length > 0) {
      process.stdout.write(`\nduplicates:\n`);
      for (const dup of duplicates) process.stdout.write(`  ${dup.name}: ${dup.first} and ${dup.second}\n`);
    }
    if (conflicts.length > 0) {
      process.stdout.write(`\nconflicts: ${conflicts.length} target file(s) already exist; pass --overwrite to replace\n`);
    }
  }

  if (hasDuplicates) {
    process.stderr.write("duplicate type names block --write\n");
    return 1;
  }
  if (conflicts.length > 0 && !flags.overwrite) {
    return 1;
  }
  if (!flags.write) return 0;

  // Apply.
  const internalWrite = internal;
  for (const item of plan) {
    if (item.action === "conflict" && !flags.overwrite) continue;
    const source = readFileSync(item.source, "utf8");
    const decls = findDeclarations(source);
    const targetDir = path.dirname(item.target);
    mkdirSync(targetDir, { recursive: true });

    const body = decls.map((decl) => decl.text).join("\n");
    const header = `// Extracted domain contract. Source: ${path.relative(SKILLS_ROOT, item.source)}.\n// Moved by extract-types-to-lib-domain. Keep this file erasable TypeScript.\n\n`;
    writeFileSync(item.target, `${header}${body}`, "utf8");

    if (internalWrite) {
      // Replace the declared blocks with a single re-export, keeping the rest.
      const names = decls.map((decl) => decl.name);
      const reexportPath = path.relative(path.dirname(item.source), item.target).replace(/\.ts$/, "").replace(/\\/g, "/");
      const reexportLine = `export type { ${names.join(", ")} } from "${reexportPath.startsWith(".") ? reexportPath : `./${reexportPath}`}";\n`;
      const spans = decls.map((decl) => [decl.docStart, decl.end]);
      // build new source
      let cursor = 0;
      let output = "";
      let inserted = false;
      for (const [start, end] of spans) {
        output += source.slice(cursor, start);
        if (!inserted) {
          output += reexportLine;
          inserted = true;
        }
        cursor = end;
      }
      output += source.slice(cursor);
      writeFileSync(item.source, output, "utf8");
    }
  }

  if (!internalWrite) {
    process.stderr.write("note: source left untouched (--allow-external); types were copied only\n");
  }

  process.stdout.write(`applied: ${plan.length} file(s) written to lib/${flags.domain}/\n`);
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
