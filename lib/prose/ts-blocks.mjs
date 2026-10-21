// Bracket/block reads over a TS file: array spans, object spans and their
// string fields. Used for `sections`, FAQ `{question, answer}` pairs and other
// `key: [ { … } ]` blocks. It only locates text — it never judges.

import { unescapeString } from "./ts.mjs";

/** Index of the bracket matching the opener at `open`, skipping string literals. */
export function matchBracket(src, open) {
  let depth = 0;
  let inString = false;
  for (let i = open; i < src.length; i += 1) {
    const ch = src[i];
    if (inString) {
      if (ch === "\\") i += 1;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "[" || ch === "{") depth += 1;
    else if (ch === "]" || ch === "}") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Absolute 1-based line of a character index. */
export function lineOf(src, index) {
  let line = 1;
  for (let i = 0; i < index; i += 1) if (src[i] === "\n") line += 1;
  return line;
}

/** Span of a `key: [ ... ]` array between `from` and `to`, or null. */
export function arraySpan(src, key, from = 0, to = src.length) {
  const slice = src.slice(from, to);
  const match = new RegExp(`\\b${key}\\s*:\\s*\\[`).exec(slice);
  if (!match) return null;
  const open = from + slice.indexOf("[", match.index);
  const close = matchBracket(src, open);
  return close < 0 || close > to ? null : { start: open, end: close };
}

/** Top-level `{ ... }` object spans inside a range. */
export function objectSpans(src, start, end) {
  const out = [];
  let i = start;
  while (i < end) {
    const ch = src[i];
    if (ch === '"') {
      i += 1;
      while (i < end && src[i] !== '"') {
        if (src[i] === "\\") i += 1;
        i += 1;
      }
      i += 1;
      continue;
    }
    if (ch === "{") {
      const close = matchBracket(src, i);
      if (close < 0 || close > end) break;
      out.push({ start: i, end: close });
      i = close + 1;
      continue;
    }
    i += 1;
  }
  return out;
}

/** A `field: "..."` string inside a range, with its line. */
export function fieldString(src, start, end, field) {
  const slice = src.slice(start, end);
  const match = new RegExp(`\\b${field}:\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(slice);
  if (!match) return null;
  const quote = slice.indexOf('"', match.index);
  return { value: unescapeString(match[1]), line: lineOf(src, start + quote) };
}

/** Every quoted string literal inside a range, with its line. */
export function stringsIn(src, start, end) {
  const out = [];
  const re = /"((?:[^"\\]|\\.)*)"/g;
  const slice = src.slice(start, end);
  let match = re.exec(slice);
  while (match) {
    out.push({ value: unescapeString(match[1]), line: lineOf(src, start + match.index) });
    match = re.exec(slice);
  }
  return out;
}

/**
 * Two-field records of a `key: [ { a, b }, … ]` block (e.g. FAQ
 * `question`/`answer`, fit `title`/`text`), each with both source lines.
 */
export function tsPairs(tsSource, arrayKey, fieldA, fieldB) {
  const span = arraySpan(tsSource, arrayKey);
  if (!span) return [];
  const out = [];
  for (const span_ of objectSpans(tsSource, span.start, span.end)) {
    const a = fieldString(tsSource, span_.start, span_.end, fieldA);
    const b = fieldString(tsSource, span_.start, span_.end, fieldB);
    if (a && b) out.push({ a: a.value, aLine: a.line, b: b.value, bLine: b.line });
  }
  return out;
}
