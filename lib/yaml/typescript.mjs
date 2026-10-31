// Reader for the TypeScript contracts in `lib/<domain>/*.ts`.
//
// A domain file is the single source of truth: the YAML reader validates a
// filled questionnaire against it, and the questionnaire generator prints its
// `@question` hints as comments. Nothing is duplicated by hand.
//
// Supported subset: `export interface`, `export type` (string-literal unions
// and aliases), members with primitive types, literals, unions, `T[]`,
// `Array<T>`, `Record<string, T>`, inline object types, `| null`, optional `?`,
// and JSDoc/`//` comments carrying `@question`, `@example`, `@default`,
// `@count`, `@values`.
//
// Two shape rules keep the reader small and the contract readable: one member
// per line (a member's type may not wrap), and no `enum`, `namespace`, `class`,
// function type, `Partial<T>` or index signature. Anything else throws with a
// line number instead of being guessed at.

export class TypeParseError extends Error {
  constructor(message, line = null, file = null) {
    const where = [file ? `${file}:` : "", line ? `line ${line}:` : ""].filter(Boolean).join("");
    super(where ? `${where} ${message}` : message);
    this.name = "TypeParseError";
    this.line = line;
    this.file = file;
  }
}

const IDENT = "[A-Za-z_$][\\w$]*";
const DOC_TAGS = ["question", "example", "default", "count", "values"];

const FORBIDDEN = [
  { re: /^(export\s+)?enum\b/, what: "enum" },
  { re: /^(export\s+)?namespace\b/, what: "namespace" },
  { re: /^(export\s+)?module\b/, what: "module" },
  { re: /^(export\s+)?(abstract\s+)?class\b/, what: "class" },
  { re: /^(export\s+)?(const|let|var|function)\b/, what: "runtime declaration" },
  { re: /^declare\b/, what: "declare" },
];

function depthDelta(char) {
  if (char === "{" || char === "(" || char === "[" || char === "<") return 1;
  if (char === "}" || char === ")" || char === "]" || char === ">") return -1;
  return 0;
}

/** Splits on a separator that sits at the top level of the expression. */
function splitTopLevel(text, separators) {
  const parts = [];
  let depth = 0;
  let buffer = "";
  let string = null;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (string) {
      buffer += char;
      if (char === "\\" && text[index + 1] !== undefined) {
        buffer += text[index + 1];
        index += 1;
        continue;
      }
      if (char === string) string = null;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      string = char;
      buffer += char;
      continue;
    }
    if (depth === 0 && separators.includes(char)) {
      parts.push(buffer);
      buffer = "";
      continue;
    }
    depth += depthDelta(char);
    buffer += char;
  }
  parts.push(buffer);
  return parts;
}

/** Turns comment text into `{ hint, question, example, default, count, values }`. */
export function parseDoc(rawDoc) {
  const doc = { hint: "", question: "", example: "", count: null, values: null };
  const defaults = [];
  if (!rawDoc || rawDoc.length === 0) return doc;
  for (const chunk of rawDoc) {
    const lines = chunk
      .replace(/^\/\*\*/, "")
      .replace(/\*\/$/, "")
      .split("\n")
      .map((line) => line.replace(/^\s*\/\//, "").replace(/^\s*\*\/?/, "").replace(/\s+$/, ""));
    for (const line of lines) {
      const tagMatches = [...line.matchAll(/@(\w+)(?:\s+([\s\S]*?))?(?=\s@\w+|$)/g)];
      const knownTags = tagMatches.filter((m) => DOC_TAGS.includes(m[1]));
      if (knownTags.length > 0) {
        for (const m of knownTags) {
          const value = (m[2] ?? "").trim();
          if (m[1] === "count") doc.count = Number.parseInt(value, 10);
          else if (m[1] === "default") defaults.push(value);
          else doc[m[1]] = value;
        }
        const firstAt = line.indexOf("@");
        const prosePart = firstAt > 0 ? line.slice(0, firstAt).trim() : "";
        if (prosePart) doc.hint = doc.hint ? `${doc.hint} ${prosePart}` : prosePart;
        continue;
      }
      if (line.trim() === "") continue;
      doc.hint = doc.hint ? `${doc.hint} ${line.trim()}` : line.trim();
    }
  }
  if (defaults.length > 0) doc.default = defaults.length === 1 ? defaults[0] : defaults;
  if (!doc.question && doc.hint) doc.question = doc.hint;
  if (Number.isNaN(doc.count)) doc.count = null;
  return doc;
}

/** Parses a type expression into a node the validator can walk. */
export function parseTypeExpr(text, lineNumber = null, file = null) {
  const raw = String(text).trim();
  if (raw === "") throw new TypeParseError("empty type expression", lineNumber, file);

  const parts = splitTopLevel(raw, ["|"]).map((part) => part.trim()).filter(Boolean);
  if (parts.length > 1) {
    return { kind: "union", options: parts.map((part) => parseTypeExpr(part, lineNumber, file)), line: lineNumber };
  }

  const t = raw;
  if (t === "string") return { kind: "string", line: lineNumber };
  if (t === "number") return { kind: "number", line: lineNumber };
  if (t === "boolean") return { kind: "boolean", line: lineNumber };
  if (t === "null") return { kind: "null", line: lineNumber };
  if (t === "any" || t === "unknown") return { kind: "any", line: lineNumber };
  if (/^".*"$/.test(t) || /^'.*'$/.test(t)) {
    return { kind: "literal", value: t.slice(1, -1), line: lineNumber };
  }
  if (t.endsWith("[]")) {
    return { kind: "array", of: parseTypeExpr(t.slice(0, -2), lineNumber, file), line: lineNumber };
  }
  const arrayGeneric = t.match(/^Array<([\s\S]+)>$/);
  if (arrayGeneric) {
    return { kind: "array", of: parseTypeExpr(arrayGeneric[1], lineNumber, file), line: lineNumber };
  }
  const record = t.match(/^Record<\s*string\s*,\s*([\s\S]+)>$/);
  if (record) {
    return { kind: "record", value: parseTypeExpr(record[1], lineNumber, file), line: lineNumber };
  }
  if (t.startsWith("{") && t.endsWith("}")) {
    return { kind: "object", fields: parseMembers(t.slice(1, -1), lineNumber, file), line: lineNumber };
  }
  if (new RegExp(`^${IDENT}$`).test(t)) return { kind: "ref", name: t, line: lineNumber };
  throw new TypeParseError(`unsupported type expression "${t}"`, lineNumber, file);
}

function parseMember(text, doc, lineNumber, file) {
  const body = text.trim().replace(/;$/, "").trim();
  if (body === "") return null;
  if (body.startsWith("[")) {
    throw new TypeParseError(`index signatures are not supported: "${body}"`, lineNumber, file);
  }
  if (/^(readonly|public|private|protected|static)\b/.test(body)) {
    throw new TypeParseError(`modifiers are not supported: "${body}"`, lineNumber, file);
  }
  const match = body.match(new RegExp(`^(${IDENT})\\s*(\\?)?\\s*:\\s*([\\s\\S]+)$`));
  if (!match) {
    throw new TypeParseError(`cannot read member "${body.slice(0, 60)}"`, lineNumber, file);
  }
  const [, name, optional, typeText] = match;
  return {
    name,
    optional: optional === "?",
    doc: parseDoc(doc),
    type: parseTypeExpr(typeText, lineNumber, file),
    line: lineNumber,
  };
}

/**
 * Splits an interface body into member descriptors with their doc comments.
 * A member ends at `;` or at a newline that sits at nesting depth zero.
 */
export function parseMembers(bodyText, startLine = 1, file = null) {
  const fields = [];
  let doc = [];
  let buffer = "";
  let bufferLine = startLine;
  let depth = 0;
  let line = startLine;
  let lastFlushLine = -1;

  const flush = () => {
    const member = parseMember(buffer, doc, bufferLine, file);
    if (member) fields.push(member);
    buffer = "";
    doc = [];
    lastFlushLine = line;
  };

  let index = 0;
  while (index < bodyText.length) {
    const char = bodyText[index];
    const next = bodyText[index + 1];

    if (char === "/" && next === "/") {
      const end = bodyText.indexOf("\n", index);
      const stop = end === -1 ? bodyText.length : end;
      const comment = bodyText.slice(index, stop);
      if (buffer.trim() === "" && line !== lastFlushLine) doc.push(comment);
      index = stop;
      continue;
    }

    if (char === "/" && next === "*") {
      const end = bodyText.indexOf("*/", index + 2);
      if (end === -1) throw new TypeParseError("unterminated block comment", line, file);
      const comment = bodyText.slice(index, end + 2);
      if (buffer.trim() === "" && line !== lastFlushLine) doc.push(comment);
      line += comment.split("\n").length - 1;
      index = end + 2;
      continue;
    }

    if (char === '"' || char === "'" || char === "`") {
      const closing = bodyText.indexOf(char, index + 1);
      const stop = closing === -1 ? bodyText.length : closing + 1;
      buffer += bodyText.slice(index, stop);
      index = stop;
      continue;
    }

    if (char === "\n") {
      line += 1;
      if (depth === 0 && buffer.trim() !== "") flush();
      if (depth === 0 && buffer.trim() === "") {
        bufferLine = line;
      }
      index += 1;
      continue;
    }

    if (buffer.trim() === "") bufferLine = line;
    if (char === ";" && depth === 0) {
      buffer += char;
      flush();
      index += 1;
      continue;
    }
    depth += depthDelta(char);
    buffer += char;
    index += 1;
  }
  if (buffer.trim() !== "") flush();
  return fields;
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
    depth += depthDelta(char);
    if (char === ";" && depth === 0) return index;
    if (char === "\n" && depth === 0) {
      const rest = text.slice(index + 1).trimStart();
      if (rest === "" || /^(export|import|\/\/|\/\*)/.test(rest)) return index;
    }
  }
  return text.length;
}

function lineAt(text, offset) {
  return text.slice(0, offset).split("\n").length;
}

/**
 * Parses a domain contract file into
 * `{ file, types: Map<name, decl>, imports: string[], entry: null }`.
 */
export function parseTypeScript(source, options = {}) {
  const file = options.file ?? null;
  const text = String(source ?? "").replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  const types = new Map();
  const imports = [];
  let doc = [];
  let index = 0;

  while (index < text.length) {
    const char = text[index];

    if (/\s/.test(char)) {
      if (char === "\n" && doc.length > 0 && text.slice(index + 1).trimStart() === "") doc = [];
      index += 1;
      continue;
    }

    if (char === "/" && text[index + 1] === "/") {
      const end = text.indexOf("\n", index);
      const stop = end === -1 ? text.length : end;
      doc.push(text.slice(index, stop));
      index = stop;
      continue;
    }

    if (char === "/" && text[index + 1] === "*") {
      const end = text.indexOf("*/", index + 2);
      if (end === -1) throw new TypeParseError("unterminated block comment", lineAt(text, index), file);
      doc.push(text.slice(index, end + 2));
      index = end + 2;
      continue;
    }

    const rest = text.slice(index);
    const lineNumber = lineAt(text, index);

    for (const rule of FORBIDDEN) {
      if (rule.re.test(rest)) {
        throw new TypeParseError(`${rule.what} is not supported in a domain contract`, lineNumber, file);
      }
    }

    const importMatch = rest.match(/^\s*import\s+type\s+\{([^}]*)\}\s+from\s+["'][^"']+["'];?/);
    if (importMatch) {
      for (const name of importMatch[1].split(",")) {
        const clean = name.trim().replace(/^type\s+/, "");
        if (clean) imports.push(clean);
      }
      index += importMatch[0].length;
      doc = [];
      continue;
    }

    const plainImport = rest.match(/^\s*import\s+[^;]*;?/);
    if (plainImport && !/^\s*import\s+type\b/.test(rest)) {
      throw new TypeParseError("value imports are not supported in a domain contract", lineNumber, file);
    }

    const interfaceMatch = rest.match(new RegExp(`^\\s*export\\s+interface\\s+(${IDENT})([^{]*)\\{`));
    if (interfaceMatch) {
      if (interfaceMatch[2].trim() !== "") {
        throw new TypeParseError(`"extends" is not supported: "${interfaceMatch[2].trim()}"`, lineNumber, file);
      }
      const openAt = index + interfaceMatch[0].length - 1;
      const closeAt = matchBrace(text, openAt);
      if (closeAt === -1) {
        throw new TypeParseError(`unterminated interface "${interfaceMatch[1]}"`, lineNumber, file);
      }
      const body = text.slice(openAt + 1, closeAt);
      types.set(interfaceMatch[1], {
        name: interfaceMatch[1],
        kind: "interface",
        fields: parseMembers(body, lineAt(text, openAt + 1), file),
        doc: parseDoc(doc),
        line: lineNumber,
      });
      index = closeAt + 1;
      doc = [];
      continue;
    }

    const typeMatch = rest.match(new RegExp(`^\\s*export\\s+type\\s+(${IDENT})\\s*=\\s*`));
    if (typeMatch) {
      const from = index + typeMatch[0].length;
      const end = findStatementEnd(text, from);
      const body = text.slice(from, end).trim().replace(/;$/, "");
      types.set(typeMatch[1], {
        name: typeMatch[1],
        kind: "alias",
        type: parseTypeExpr(body, lineNumber, file),
        doc: parseDoc(doc),
        line: lineNumber,
      });
      index = end + 1;
      doc = [];
      continue;
    }

    const stop = text.indexOf("\n", index);
    const chunk = stop === -1 ? rest : text.slice(index, stop);
    throw new TypeParseError(`unsupported declaration "${chunk.trim().slice(0, 60)}"`, lineNumber, file);
  }

  return { file, types, imports, entry: null };
}

/** PascalCase of a file name: `precedent-questionnaire.ts` → `PrecedentQuestionnaire`. */
export function pascalCase(name) {
  return String(name)
    .replace(/\.[^.]+$/, "")
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join("");
}

/**
 * Picks the entry interface: `entry` wins, then the type named after the file,
 * then the single interface nobody else references. Anything else throws and
 * lists the candidates, because guessing publishes the wrong contract.
 */
export function resolveEntry(parsed, options = {}) {
  const { types, file } = parsed;
  const names = [...types.keys()];
  if (options.entry) {
    if (!types.has(options.entry)) {
      throw new TypeParseError(`entry type "${options.entry}" not found; candidates: ${names.join(", ")}`, null, file);
    }
    return options.entry;
  }
  if (file) {
    const guess = pascalCase(String(file).split(/[\\/]/).pop());
    if (types.has(guess)) return guess;
  }
  const referenced = new Set();
  const collect = (node) => {
    if (!node) return;
    if (node.kind === "ref") referenced.add(node.name);
    if (node.kind === "array") collect(node.of);
    if (node.kind === "record") collect(node.value);
    if (node.kind === "union") node.options.forEach(collect);
    if (node.kind === "object") node.fields.forEach((field) => collect(field.type));
  };
  for (const decl of types.values()) {
    collect(decl.type);
    (decl.fields ?? []).forEach((field) => collect(field.type));
  }
  const roots = names.filter((name) => types.get(name).kind === "interface" && !referenced.has(name));
  if (roots.length === 1) return roots[0];
  throw new TypeParseError(
    `cannot pick an entry type; pass --entry. Candidates: ${roots.length > 0 ? roots.join(", ") : names.join(", ")}`,
    null,
    file,
  );
}

/** Resolves a ref node to its object fields; passes other kinds through. */
export function resolveTypeNode(node, types) {
  if (!node) return node;
  if (node.kind === "ref") {
    const decl = types.get(node.name);
    if (decl?.kind === "interface") return { kind: "object", fields: decl.fields, name: decl.name };
    if (decl?.kind === "alias") return resolveTypeNode(decl.type, types);
  }
  return node;
}
export function describeType(node, types = new Map(), depth = 0) {
  if (!node) return "unknown";
  switch (node.kind) {
    case "union":
      return node.options.map((option) => describeType(option, types, depth + 1)).join(" | ");
    case "literal":
      return `"${node.value}"`;
    case "array":
      return `${describeType(node.of, types, depth + 1)}[]`;
    case "record":
      return `Record<string, ${describeType(node.value, types, depth + 1)}>`;
    case "ref": {
      if (depth > 2) return node.name;
      const decl = types.get(node.name);
      if (!decl) return node.name;
      return decl.kind === "alias" ? describeType(decl.type, types, depth + 1) : node.name;
    }
    case "object":
      return `{ ${node.fields.map((field) => field.name).join(", ")} }`;
    default:
      return node.kind;
  }
}

/** String-literal values a node accepts, flattened through unions, refs and aliases. */
export function literalValues(node, types = new Map(), depth = 0) {
  if (!node || depth > 6) return null;
  if (node.kind === "literal") return [node.value];
  if (node.kind === "union") {
    const out = [];
    for (const option of node.options) {
      const values = literalValues(option, types, depth + 1);
      if (!values) return null;
      out.push(...values);
    }
    return out;
  }
  if (node.kind === "ref") {
    const decl = types.get(node.name);
    return decl ? literalValues(decl.type, types, depth + 1) : null;
  }
  return null;
}
