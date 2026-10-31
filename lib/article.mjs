// The article file codec: frontmatter fields and the body, read the same way by
// every skill.
//
// `lib/prose/markdown.mjs` stays the line-mapping module for the prose gates —
// it reports where a paragraph starts. This module answers a different question:
// what does the file declare. It consumes the newline after the closing `---`,
// because a reader wants the body, not the frontmatter's trailing blank line.
//
// Supported frontmatter: `key: scalar`, `key: [a, "b"]`, and a block list
//
//   tags:
//     - a
//     - b
//
// Quotes around a scalar are stripped. An empty value stays `""` unless a block
// list follows it. Anything else — anchors, nested maps, multiline scalars — is
// not frontmatter this repo writes, and is skipped rather than guessed at.

import { readFileSync } from "node:fs";
import { basename } from "node:path";

import { wordCount } from "#lib/jev/text.mjs";

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
const KEY_VALUE = /^([A-Za-z_][\w-]*):\s*(.*)$/;
const LIST_ITEM = /^\s+-\s+(.*)$/;

/** Strips one layer of matching single or double quotes. */
export function unquote(value) {
  const text = String(value ?? "").trim();
  if (text.length >= 2 && /^["']/.test(text) && text[0] === text[text.length - 1]) {
    return text.slice(1, -1);
  }
  return text;
}

/** `[a, "b"]` as an array; anything else is not an inline list. */
export function parseInlineList(value) {
  const text = String(value ?? "").trim();
  if (!text.startsWith("[") || !text.endsWith("]")) return null;
  return text
    .slice(1, -1)
    .split(",")
    .map((item) => unquote(item))
    .filter((item) => item !== "");
}

/**
 * Frontmatter as a flat map. A value is a string, or an array when the key
 * carries an inline or a block list.
 */
export function parseFrontmatterFields(frontmatter) {
  const lines = String(frontmatter ?? "").split(/\r?\n/);
  const fields = {};

  for (let index = 0; index < lines.length; index += 1) {
    const keyValue = KEY_VALUE.exec(lines[index]);
    if (!keyValue) continue;
    const [, key, rawValue] = keyValue;
    const value = rawValue.trim();

    const inline = parseInlineList(value);
    if (inline) {
      fields[key] = inline;
      continue;
    }

    if (value === "") {
      const items = [];
      let next = index + 1;
      while (next < lines.length) {
        const item = LIST_ITEM.exec(lines[next]);
        if (!item) break;
        items.push(unquote(item[1]));
        next += 1;
      }
      if (items.length > 0) {
        fields[key] = items;
        index = next - 1;
        continue;
      }
      fields[key] = "";
      continue;
    }

    fields[key] = unquote(value);
  }

  return fields;
}

/** One field as a string; an array collapses to its first item. */
export function fieldString(fields, key) {
  const value = fields?.[key];
  if (Array.isArray(value)) return value[0] ?? "";
  return value === undefined || value === null ? "" : String(value);
}

/** One field as an array. A JSON-array string is parsed, a scalar is wrapped. */
export function fieldList(fields, key) {
  const value = fields?.[key];
  if (Array.isArray(value)) return value;
  if (typeof value !== "string" || value.trim() === "") return [];
  const inline = parseInlineList(value);
  if (inline) return inline;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [value];
  }
}

/** Splits an article into its frontmatter block and its body. */
export function splitArticle(text) {
  const raw = String(text ?? "").replace(/^\uFEFF/, "");
  const match = FRONTMATTER.exec(raw);
  if (!match) return { frontmatter: "", body: raw };
  return { frontmatter: match[1], body: raw.slice(match[0].length) };
}

/** Frontmatter fields plus the body of an article's text. */
export function readArticleText(text) {
  const { frontmatter, body } = splitArticle(text);
  return { frontmatter, fields: parseFrontmatterFields(frontmatter), body };
}

/**
 * Reads one article file. `slug` is the file name without its locale suffix, so
 * `cases.ru.md` and `cases.en.md` report the same slug.
 */
export function readArticleFile(file) {
  const { frontmatter, fields, body } = readArticleText(readFileSync(file, "utf8"));
  return {
    file,
    slug: articleSlug(basename(file)),
    frontmatter,
    fields,
    body,
    words: wordCount(body),
  };
}

/** `<slug>.<lang>.md` -> `<slug>`; a file without a locale keeps its name. */
export function articleSlug(fileName) {
  const stem = String(fileName ?? "").replace(/\.(md|markdown)$/i, "");
  return stem.replace(/\.(ru|en|de|fr|es|it|pt|pl|tr|kk|ua|by)$/i, "");
}
