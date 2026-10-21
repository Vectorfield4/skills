// TS string-literal reads for the content gates: unescape, first field, and the
// full literal scan. The bracket/block helpers a structured read needs live in
// `ts-blocks.mjs`. Both only locate text — they never judge.

/** Unescapes the common sequences in a TS double-quoted string literal. */
export function unescapeString(value) {
  return value.replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
}

/** First prose value of a `key: "..."` field in a TS i18n file, for G2 context. */
export function firstField(tsSource, key) {
  const match = new RegExp(`${key}:\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(tsSource);
  return match ? unescapeString(match[1]) : null;
}

/**
 * Prose string literals of a TS i18n dictionary (service or solution), each
 * with its 1-based source line and the key it sits under when one is on the
 * same line. Pure symbol literals (no letters) are skipped; very short tokens
 * are left to the caller. Shared by every dictionary-shaped domain.
 */
export function tsStrings(tsSource) {
  const lines = tsSource.split(/\r?\n/);
  const out = [];
  for (let i = 0; i < lines.length; i += 1) {
    const re = /"((?:[^"\\]|\\.)*)"/g;
    let match = re.exec(lines[i]);
    while (match) {
      const text = unescapeString(match[1]);
      if (/[\p{L}]/u.test(text)) {
        const before = lines[i].slice(0, match.index);
        const key = /([A-Za-z_][\w]*)\s*:\s*$/.exec(before)?.[1] ?? null;
        out.push({ key, text, line: i + 1 });
      }
      match = re.exec(lines[i]);
    }
  }
  return out;
}
