// Alias map from the project's TypeScript source to `data/<host>/tag-aliases.json`.
//
// The blog owns the tag vocabulary (`src/shared/config/productTags.ts`), the shop
// only consumes it. Generating the JSON keeps one source of truth instead of the
// duplicated `TAG_ALIASES` maps that used to drift apart.

import { existsSync, readFileSync } from "node:fs";

const KEY = String.raw`(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|([\p{L}\p{N}_-]+))`;
const LIST = String.raw`\[([^\]]*)\]`;
const PAIR = new RegExp(String.raw`${KEY}\s*:\s*${LIST}`, "gu");
const ITEM = /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^\s,]+/gu;

/** Removes `//` and `/* *\/` comments without touching string literals. */
export function stripComments(text) {
  const raw = String(text ?? "");
  let out = "";
  let index = 0;
  let quote = null;

  while (index < raw.length) {
    const char = raw[index];

    if (quote) {
      out += char;
      if (char === "\\") {
        out += raw[index + 1] ?? "";
        index += 2;
        continue;
      }
      if (char === quote) quote = null;
      index += 1;
      continue;
    }

    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      out += char;
      index += 1;
      continue;
    }
    if (char === "/" && raw[index + 1] === "/") {
      const end = raw.indexOf("\n", index);
      index = end === -1 ? raw.length : end;
      continue;
    }
    if (char === "/" && raw[index + 1] === "*") {
      const end = raw.indexOf("*/", index + 2);
      index = end === -1 ? raw.length : end + 2;
      continue;
    }
    out += char;
    index += 1;
  }

  return out;
}

function unquote(token) {
  const text = String(token ?? "").trim();
  if (!text) return "";
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    return text
      .slice(1, -1)
      .replace(/\\"/g, '"')
      .replace(/\\'/g, "'")
      .replace(/\\\\/g, "\\");
  }
  return text;
}

/**
 * Parses `TAG_ALIASES = { canon: ["a", "b"], "canon two": [...] }`.
 * The object shape is closed, so anything that is not `key: [list]` is ignored;
 * an empty result is an error, not an empty map.
 */
export function parseAliasesSource(text) {
  const source = stripComments(text);
  const start = source.indexOf("TAG_ALIASES");
  if (start === -1) throw new Error("TAG_ALIASES not found");
  const open = source.indexOf("{", start);
  if (open === -1) throw new Error("TAG_ALIASES has no object literal");

  const body = source.slice(open);
  const aliases = {};
  for (const match of body.matchAll(PAIR)) {
    const canonical = unquote(match[1] ?? match[2] ?? match[3] ?? "");
    if (!canonical) continue;
    const list = [...match[4].matchAll(ITEM)]
      .map((item) => unquote(item[0]))
      .filter(Boolean);
    aliases[canonical] = [...new Set([...(aliases[canonical] ?? []), ...list])];
  }

  if (Object.keys(aliases).length === 0) throw new Error("TAG_ALIASES parsed to an empty map");
  return aliases;
}

/** Reads the file and returns the alias map, sorted by canonical name. */
export function readAliasesFile(file) {
  if (!existsSync(file)) throw new Error(`aliases source not found: ${file}`);
  const parsed = parseAliasesSource(readFileSync(file, "utf8"));
  const sorted = {};
  for (const key of Object.keys(parsed).sort((a, b) => a.localeCompare(b, "ru"))) {
    sorted[key] = parsed[key];
  }
  return sorted;
}
