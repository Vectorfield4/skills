// Code-unit extraction for the code-quality Jev gate.
//
// A unit is a top-level (indentation ≤ 2) function, arrow function or class,
// with a body slice and its 1-based start line. The scanner is shallow on
// purpose — a regex finds the declaration header, then brace matching (skipping
// strings, template literals and comments) finds the body. No AST, no deps.

const HEADERS = [
  {
    kind: "class",
    re: /^(\s*)(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/,
  },
  {
    kind: "function",
    re: /^(\s*)(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/,
  },
  {
    kind: "function",
    re: /^(\s*)(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*(?:async\s+)?(?:function\b|\([^)]*\)\s*(?::[^=]+)?=>|[A-Za-z_$][\w$]*\s*=>)/,
  },
];

/** Index of the quote closing the string at `start`, honouring backslash escapes. */
function skipString(src, start) {
  const quote = src[start];
  for (let i = start + 1; i < src.length; i += 1) {
    if (src[i] === "\\") {
      i += 1;
      continue;
    }
    if (src[i] === quote) return i;
  }
  return src.length - 1;
}

/** End of the block opened at `open`, skipping strings and comments; -1 if unclosed. */
function matchBrace(src, open) {
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    const ch = src[i];
    if (ch === '"' || ch === "'" || ch === "`") {
      i = skipString(src, i);
      continue;
    }
    if (ch === "/" && src[i + 1] === "/") {
      const nl = src.indexOf("\n", i);
      if (nl === -1) return -1;
      i = nl;
      continue;
    }
    if (ch === "/" && src[i + 1] === "*") {
      const close = src.indexOf("*/", i);
      if (close === -1) return -1;
      i = close + 1;
      continue;
    }
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Newline count in `src[from, to)`. */
function newlines(src, from, to) {
  let count = 0;
  for (let i = from; i < to; i += 1) if (src[i] === "\n") count += 1;
  return count;
}

/**
 * Locates top-level functions, arrow functions and classes. Each unit carries
 * its `name`, `kind`, 1-based `line` and body `text` (truncated to `maxChars`).
 */
export function codeUnits(source, { maxChars = 1800 } = {}) {
  const out = [];
  let i = 0;
  let line = 1;
  while (i < source.length) {
    const newline = source.indexOf("\n", i);
    const lineEnd = newline === -1 ? source.length : newline;
    const text = source.slice(i, lineEnd);
    const hit = HEADERS.map((header) => ({ header, match: header.re.exec(text) })).find(
      (entry) => entry.match && entry.match[1].length <= 2,
    );
    if (hit) {
      const brace = source.indexOf("{", i);
      const bound = newline === -1 ? source.length : source.indexOf("\n", newline + 1);
      let bodyEnd = lineEnd;
      if (brace !== -1 && brace < (bound === -1 ? source.length : bound)) {
        const close = matchBrace(source, brace);
        bodyEnd = close === -1 ? source.length : close + 1;
      }
      let body = source.slice(i, bodyEnd).trim();
      if (body.length > maxChars) body = `${body.slice(0, maxChars)}…`;
      out.push({ name: hit.match[2], kind: hit.header.kind, text: body, line });
      line += newlines(source, i, bodyEnd);
      i = bodyEnd;
      continue;
    }
    i = lineEnd + 1;
    line += 1;
  }
  return out;
}
