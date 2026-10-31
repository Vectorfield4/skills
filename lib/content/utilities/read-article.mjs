// The one article reader: one markdown file in, one article record out.
//
// Five skill scripts grew their own frontmatter parser and disagreed about
// `tags` and `draft`. This module is the single answer, and it stays a thin
// layer: the frontmatter codec comes from `#lib/article.mjs`, the line mapping
// from `#lib/prose/markdown.mjs`, the CLI contract from `#lib/cli.mjs`.
//
// Nothing here throws on odd input. A field the file does not declare is `""`
// or `null`, a list that cannot be read is `[]`, and `draft` defaults to true
// because the schema default is true.
//
//   node lib/content/utilities/read-article.mjs --file articles/<slug>.ru.md
//   node lib/content/utilities/read-article.mjs --file x.ru.md --field tags

import { readFileSync } from "node:fs";

import { parseFrontmatterFields, unquote } from "#lib/article.mjs";
import { isEntryPoint, logLine, printJson, runUtility } from "#lib/cli.mjs";
import { frontmatterField, splitFrontmatter } from "#lib/prose/markdown.mjs";

const BOM = /^\uFEFF/;
const LEADING_NEWLINES = /^(?:\r?\n)+/;
const CONTAINERS = new Set(["file", "frontmatter", "body", "bodyLine", "fields"]);

const USAGE = `read-article: read one article file as JSON

  node read-article.mjs --file articles/<slug>.ru.md [--field <name>] [--help]

Flags
  --file    Article markdown file to read. Required.
  --field   Also report one field: a property of the article (title, slug,
            tags, status, sourceUrl, wpId, wpUrl, draft) or a raw frontmatter
            scalar (source_url, wp_id).
  --help    Print this block and exit 0.

Exit codes
  0  read          1  unreadable file          2  bad usage
`;

/** A raw frontmatter scalar: quotes stripped, `null` when the key is absent. */
export function field(frontmatter, key) {
  const raw = frontmatterField(frontmatter, key);
  return raw === undefined ? null : unquote(raw);
}

/**
 * One list field. It accepts the three shapes a real project writes:
 *
 *   tags: ["AGCO", "AgiBot"]     JSON array, the live format
 *   tags:                        block list
 *     - AGCO
 *   tags: "AGCO, AgiBot"         comma string
 *
 * A bare scalar reads as a one-item list, and an absent key reads as `[]`.
 */
export function listField(frontmatter, key) {
  const raw = frontmatterField(frontmatter, key);
  if (raw && raw.startsWith("[")) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      // A hand-written bracket list is not JSON; the field codec reads that one.
    }
  }

  const value = parseFrontmatterFields(frontmatter)[key];
  if (Array.isArray(value)) return value.map(String);
  if (typeof value !== "string" || value.trim() === "") return [];
  if (value.includes(",")) {
    return value
      .split(",")
      .map((item) => unquote(item))
      .filter((item) => item !== "");
  }
  return [unquote(value)];
}

/** Lowercase, letter and digit runs joined by `-`, at most 80 characters. */
export function slugify(text) {
  const slug = String(text ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/, "");
  return slug || "article";
}

/** Lowercase, every run of non letters and digits collapsed to a space. */
export function normalizeTitle(text) {
  return String(text ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Every field as a string; a list collapses to its comma-joined items. */
function stringFields(frontmatter) {
  const fields = {};
  for (const [key, value] of Object.entries(parseFrontmatterFields(frontmatter))) {
    fields[key] = Array.isArray(value) ? value.join(", ") : value;
  }
  return fields;
}

/** A numeric field, or `null` when it is absent or not a number. */
function numberOrNull(value) {
  const text = String(value ?? "").trim();
  if (text === "") return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

/** The schema default is true, so only an explicit `draft: false` turns it off. */
function isDraftFalse(value) {
  return /^false,?$/i.test(String(value ?? "").trim());
}

/**
 * The whole article record: frontmatter, body, body line and the fields every
 * consumer reads. `body` starts after the closing fence, with the newlines that
 * followed it trimmed, while `bodyLine` still points at the first kept line.
 */
export function parseArticle(text) {
  const source = String(text ?? "").replace(BOM, "");
  const { frontmatter, body: rawBody, bodyLine: rawBodyLine } = splitFrontmatter(source);
  const fields = stringFields(frontmatter);

  const body = frontmatter ? rawBody.replace(LEADING_NEWLINES, "") : rawBody;
  const trimmed = rawBody.slice(0, rawBody.length - body.length);
  const skippedLines = frontmatter && trimmed ? trimmed.split(/\r?\n/).length - 2 : 0;

  return {
    frontmatter,
    body,
    bodyLine: frontmatter ? rawBodyLine + skippedLines : 1,
    fields,
    title: fields.title ?? "",
    slug: fields.slug ?? "",
    tags: listField(frontmatter, "tags"),
    status: fields.status ?? "",
    sourceUrl: fields.source_url || fields.sourceUrl || "",
    wpId: numberOrNull(fields.wp_id),
    wpUrl: fields.wp_url ?? "",
    draft: !isDraftFalse(fields.draft),
  };
}

/** `parseArticle` of one file, plus the path it came from. */
export function readArticleFile(file) {
  return { file, ...parseArticle(readFileSync(file, "utf8")) };
}

/** One field for the CLI: an article property first, a frontmatter scalar next. */
function fieldValue(article, name) {
  if (!CONTAINERS.has(name) && Object.hasOwn(article, name)) return article[name];
  return field(article.frontmatter, name);
}

async function main(flags) {
  if (!flags.file) {
    logLine(USAGE);
    return 2;
  }

  let article;
  try {
    article = readArticleFile(flags.file);
  } catch (error) {
    printJson({ ok: false, file: flags.file, error: String(error?.message ?? error), article: null });
    return 1;
  }

  const result = { ok: true, file: flags.file, error: null, article };
  if (flags.field) {
    result.field = flags.field;
    result.value = fieldValue(article, flags.field);
  }
  printJson(result);
  return 0;
}

if (isEntryPoint(import.meta.url)) {
  process.exitCode = await runUtility({
    usage: USAGE,
    spec: { file: "string", field: "string" },
    main,
  });
}
