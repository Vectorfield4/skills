// Narrow YAML reader for hand-filled domain files (`data/<domain>/*.yaml`).
//
// Supported: nested mappings, sequences, `- key: value` list items, plain and
// quoted scalars, booleans, null, numbers, block scalars (`|`, `|-`, `|+`,
// `>`, `>-`, `>+`) and full-line or trailing comments.
//
// Rejected with a line number: anchors, aliases, tags, flow collections,
// multiple documents, tabs in indentation, merge keys. This is deliberately
// not a YAML implementation — a questionnaire a human filled by hand must fail
// loudly on the first line it cannot represent instead of silently dropping a
// field.

export class YamlError extends Error {
  constructor(message, line = null) {
    super(line === null ? message : `line ${line}: ${message}`);
    this.name = "YamlError";
    this.line = line;
  }
}

const NUMBER_RE = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/;
const BLOCK_RE = /^([|>])([+-]?)$/;
const KEY_RE = /^[\p{L}_][\p{L}\p{N}_.\- ]*$/u;

function toLines(text) {
  return String(text ?? "")
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((raw, index) => ({ raw, number: index + 1 }));
}

function indentOf(raw, lineNumber) {
  if (raw.startsWith("\t")) {
    throw new YamlError("tab in indentation; use spaces", lineNumber);
  }
  return raw.match(/^ */)[0].length;
}

function isIgnorable(raw) {
  const trimmed = raw.trim();
  return trimmed === "" || trimmed.startsWith("#");
}

/** Drops a trailing `# comment` outside quotes; throws on an unterminated quote. */
export function stripComment(text, lineNumber) {
  let quote = null;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quote) {
      if (char === "\\" && quote === '"') {
        index += 1;
        continue;
      }
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === "#" && (index === 0 || /\s/.test(text[index - 1]))) {
      return text.slice(0, index).trimEnd();
    }
  }
  if (quote) {
    throw new YamlError(`unterminated ${quote === '"' ? "double" : "single"}-quoted value`, lineNumber);
  }
  return text.trimEnd();
}

function unescapeDouble(body, lineNumber) {
  let out = "";
  for (let index = 0; index < body.length; index += 1) {
    const char = body[index];
    if (char !== "\\") {
      out += char;
      continue;
    }
    const next = body[index + 1];
    index += 1;
    if (next === "n") out += "\n";
    else if (next === "t") out += "\t";
    else if (next === "r") out += "\r";
    else if (next === '"') out += '"';
    else if (next === "\\") out += "\\";
    else if (next === "/") out += "/";
    else if (next === "u") {
      const hex = body.slice(index + 1, index + 5);
      if (!/^[0-9a-fA-F]{4}$/.test(hex)) {
        throw new YamlError(`bad \\u escape "${hex}"`, lineNumber);
      }
      out += String.fromCharCode(Number.parseInt(hex, 16));
      index += 4;
    } else {
      throw new YamlError(`unsupported escape "\\${next ?? ""}"`, lineNumber);
    }
  }
  return out;
}

/** Parses a scalar cell: quoted string, number, boolean, null or plain text. */
export function parseScalar(text, lineNumber) {
  const raw = stripComment(text, lineNumber);
  if (raw === "" || raw === "null" || raw === "~" || raw === "Null" || raw === "NULL") return null;
  if (raw === "true" || raw === "True" || raw === "TRUE") return true;
  if (raw === "false" || raw === "False" || raw === "FALSE") return false;
  if (raw.startsWith('"')) {
    if (raw.length < 2 || !raw.endsWith('"')) {
      throw new YamlError("unterminated double-quoted value", lineNumber);
    }
    return unescapeDouble(raw.slice(1, -1), lineNumber);
  }
  if (raw.startsWith("'")) {
    if (raw.length < 2 || !raw.endsWith("'")) {
      throw new YamlError("unterminated single-quoted value", lineNumber);
    }
    return raw.slice(1, -1).replace(/''/g, "'");
  }
  if (raw === "[]" ) return [];
  if (raw === "{}") return {};
  if (/^[&*!]/.test(raw)) {
    throw new YamlError("anchors, aliases and tags are not supported", lineNumber);
  }
  if (/^[[{]/.test(raw)) {
    throw new YamlError("flow collections are not supported; write a list or a map", lineNumber);
  }
  if (NUMBER_RE.test(raw)) return Number(raw);
  return raw;
}

function splitKey(body, lineNumber) {
  let quote = null;
  for (let index = 0; index < body.length; index += 1) {
    const char = body[index];
    if (quote) {
      if (char === "\\" && quote === '"') {
        index += 1;
        continue;
      }
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === ":" && (index + 1 === body.length || body[index + 1] === " " || body[index + 1] === "\t")) {
      const key = body.slice(0, index).trim();
      if (key === "<<") {
        throw new YamlError("merge keys are not supported; write the fields out", lineNumber);
      }
      if (!KEY_RE.test(key)) {
        throw new YamlError(`bad key "${key}"`, lineNumber);
      }
      return { key, rest: body.slice(index + 1).trim() };
    }
  }
  return null;
}

function hasKey(body, lineNumber) {
  return splitKey(body, lineNumber) !== null;
}

function foldLines(lines) {
  let out = "";
  for (const line of lines) {
    if (line === "") {
      out += "\n";
      continue;
    }
    out += out === "" || out.endsWith("\n") ? line : ` ${line}`;
  }
  return out;
}

class Reader {
  constructor(lines, collector) {
    this.lines = lines;
    this.index = 0;
    this.collector = collector ?? null;
  }

  note(path, lineNumber) {
    if (this.collector && path) this.collector.set(path, lineNumber);
  }

  skipIgnorable() {
    while (this.index < this.lines.length && isIgnorable(this.lines[this.index].raw)) {
      this.index += 1;
    }
  }

  /** Next meaningful line without consuming it. */
  peek() {
    this.skipIgnorable();
    return this.index < this.lines.length ? this.lines[this.index] : null;
  }

  childPath(parent, key) {
    if (!parent) return String(key);
    return /^\d+$/.test(String(key)) ? `${parent}[${key}]` : `${parent}.${key}`;
  }

  parseDocument() {
    const first = this.peek();
    if (!first) return null;
    if (first.raw.trim() === "---" || first.raw.trim() === "...") {
      throw new YamlError("multi-document YAML is not supported; drop the --- line", first.number);
    }
    const value = this.parseBlock(indentOf(first.raw, first.number), "");
    this.skipIgnorable();
    if (this.index < this.lines.length) {
      const stray = this.lines[this.index];
      throw new YamlError(`unexpected content "${stray.raw.trim()}"`, stray.number);
    }
    return value;
  }

  parseBlock(indent, path) {
    const line = this.peek();
    if (!line) return null;
    const actual = indentOf(line.raw, line.number);
    if (actual < indent) return null;
    const body = line.raw.slice(actual);
    if (body === "-" || body.startsWith("- ")) return this.parseSequence(actual, path);
    if (hasKey(body, line.number)) return this.parseMapping(actual, path);
    this.index += 1;
    return parseScalar(body, line.number);
  }

  parseMapping(indent, path) {
    const out = {};
    for (;;) {
      const line = this.peek();
      if (!line) break;
      const actual = indentOf(line.raw, line.number);
      if (actual < indent) break;
      if (actual > indent) {
        throw new YamlError(`unexpected indentation (${actual} spaces, expected ${indent})`, line.number);
      }
      const body = line.raw.slice(actual);
      if (body === "-" || body.startsWith("- ")) break;
      const pair = splitKey(body, line.number);
      if (!pair) throw new YamlError(`expected "key: value", got "${body.trim()}"`, line.number);
      const { key, rest } = pair;
      if (Object.prototype.hasOwnProperty.call(out, key)) {
        throw new YamlError(`duplicate key "${key}"`, line.number);
      }
      const keyPath = this.childPath(path, key);
      this.note(keyPath, line.number);
      this.index += 1;
      out[key] = this.parseValue(rest, line, indent, keyPath);
    }
    return out;
  }

  parseValue(rest, line, indent, keyPath) {
    const cleaned = stripComment(rest, line.number);
    if (cleaned !== "") {
      const block = cleaned.match(BLOCK_RE);
      if (block) return this.readBlockScalar(block[1], block[2], indent, line.number);
      return parseScalar(cleaned, line.number);
    }
    const next = this.peek();
    if (!next) return null;
    const nextIndent = indentOf(next.raw, next.number);
    if (nextIndent > indent) return this.parseBlock(nextIndent, keyPath);
    const nextBody = next.raw.slice(nextIndent);
    if (nextIndent === indent && (nextBody === "-" || nextBody.startsWith("- "))) {
      return this.parseSequence(indent, keyPath);
    }
    return null;
  }

  parseSequence(indent, path) {
    const out = [];
    for (;;) {
      const line = this.peek();
      if (!line) break;
      const actual = indentOf(line.raw, line.number);
      if (actual < indent) break;
      if (actual > indent) {
        throw new YamlError(`unexpected indentation (${actual} spaces, expected ${indent})`, line.number);
      }
      const body = line.raw.slice(actual);
      if (!(body === "-" || body.startsWith("- "))) break;
      const itemPath = this.childPath(path, out.length);
      this.note(itemPath, line.number);
      if (body === "-") {
        this.index += 1;
        const next = this.peek();
        if (next && indentOf(next.raw, next.number) > indent) {
          out.push(this.parseBlock(indentOf(next.raw, next.number), itemPath));
        } else {
          out.push(null);
        }
        continue;
      }
      // Rewrite `- x` as `  x` so the item body parses as an ordinary block at
      // indent + 2, which is where its sibling keys already sit.
      this.lines[this.index].raw = `${" ".repeat(indent)}  ${body.slice(2)}`;
      out.push(this.parseBlock(indent + 2, itemPath));
    }
    return out;
  }

  readBlockScalar(style, chomp, parentIndent, lineNumber) {
    const collected = [];
    let blockIndent = null;
    while (this.index < this.lines.length) {
      const { raw } = this.lines[this.index];
      if (raw.trim() === "") {
        collected.push("");
        this.index += 1;
        continue;
      }
      const indent = indentOf(raw, this.lines[this.index].number);
      if (indent <= parentIndent) break;
      if (blockIndent === null) blockIndent = indent;
      if (indent < blockIndent) break;
      collected.push(raw.slice(blockIndent));
      this.index += 1;
    }
    while (collected.length > 0 && collected[collected.length - 1] === "") collected.pop();
    const body = style === ">" ? foldLines(collected) : collected.join("\n");
    if (chomp === "-") return body.replace(/\s+$/, "");
    if (chomp === "+") return body === "" ? "" : `${body.replace(/\s+$/, "")}\n`;
    return body === "" ? "" : `${body.replace(/\s+$/, "")}\n`;
  }
}

/** Parses a hand-filled YAML document. Throws `YamlError` with a line number. */
export function parseYaml(text) {
  return new Reader(toLines(text), null).parseDocument();
}

/**
 * Same parse, plus a `Map<jsonPath, lineNumber>` so a validation error can
 * point at the line a human typed. Paths look like `results.primary[0].after`.
 */
export function parseYamlWithLines(text) {
  const lines = new Map();
  const value = new Reader(toLines(text), lines).parseDocument();
  return { value, lines };
}
