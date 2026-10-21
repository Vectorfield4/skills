// Markdown line mapping for the content gates: frontmatter and prose
// paragraphs. It only locates text — it never judges — so the gates stay
// testable without the network. TS-dictionary parsing lives in `ts.mjs`.

/** Strips a leading YAML frontmatter block. Returns the body and the frontmatter. */
export function splitFrontmatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!match) return { frontmatter: "", body: text, bodyLine: 1 };
  const lineCount = match[0].split(/\r?\n/).length;
  return { frontmatter: match[1], body: text.slice(match[0].length), bodyLine: lineCount + 1 };
}

/** Reads one scalar field from a frontmatter string. */
export function frontmatterField(frontmatter, key) {
  return new RegExp(`^${key}:\\s*(.+)$`, "m").exec(frontmatter)?.[1]?.trim();
}

/** Parses a JSON array field (the `related*` lists) from frontmatter. */
export function frontmatterList(frontmatter, key) {
  const raw = frontmatterField(frontmatter, key);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

const SKIP_LINE = /^(#{1,6}\s|>|\||([-*+]|\d+\.)\s)/;

/**
 * Prose paragraphs of a markdown article, each with its 1-based source line.
 * Headings, tables, blockquotes, lists and fenced code are not prose and are
 * skipped; a paragraph is a blank-line-separated run of prose lines.
 */
export function articleParagraphs(markdown) {
  const lines = markdown.split(/\r?\n/);
  const out = [];
  let inFrontmatter = false;
  let inCode = false;
  let buffer = [];
  let startLine = 0;
  const flush = () => {
    if (!buffer.length) return;
    out.push({ text: buffer.join(" "), line: startLine });
    buffer = [];
  };
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (i === 0 && line.trim() === "---") {
      inFrontmatter = true;
      continue;
    }
    if (inFrontmatter) {
      if (line.trim() === "---") inFrontmatter = false;
      continue;
    }
    const trimmed = line.trim();
    if (trimmed.startsWith("```")) {
      inCode = !inCode;
      flush();
      continue;
    }
    if (inCode) continue;
    if (!trimmed) {
      flush();
      continue;
    }
    if (SKIP_LINE.test(trimmed)) {
      flush();
      continue;
    }
    if (!buffer.length) startLine = i + 1;
    buffer.push(trimmed);
  }
  flush();
  return out;
}
