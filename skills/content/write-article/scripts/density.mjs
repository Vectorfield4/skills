#!/usr/bin/env node
/**
 * Baseline text metrics for a write-article draft (RU or EN).
 *
 * Computes the metrics the editorial gates grade on: prose word and sentence
 * counts, the sentence-to-paragraph density per H2 section, the adjacent
 * paragraph length delta, the per-paragraph sentence-length standard deviation,
 * the document peak sentence, the paragraph sentence-count frequency map, the
 * spatial-bridge keyword frequency, the lead-paragraph weight per H2, and the
 * closing-anchor presence per paragraph. When both language files of a slug are
 * present it also computes the mirror sentence delta and the positional clause
 * correlation between RU and EN.
 *
 * Counting rules:
 *  - frontmatter is stripped;
 *  - headings, table rows and list blocks are markdown elements, not prose, and
 *    are excluded from every prose metric (they are counted separately);
 *  - a paragraph is a blank-line-separated prose block inside one H2 section;
 *  - a sentence ends on `.`, `!`, `?` or `…`; decimals (`3.5`) and the common
 *    abbreviations below do not end a sentence;
 *  - a word is a whitespace-separated token that holds at least one letter or
 *    digit, with markdown emphasis and link syntax removed.
 *
 * Usage:
 *   node scripts/density.mjs <file.md> [more.md ...] [--json] [--verbose]
 *   node scripts/density.mjs            # every articles/*.{ru,en}.md
 *
 * Options:
 *   --json     print one JSON document instead of the tables
 *   --verbose  list per-paragraph sentence lengths and the raw matches
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";

const ARTICLES_DIR = join(process.cwd(), "articles");

/** Directional transitions that mimic coherence with page topography. */
const SPATIAL_BRIDGES = {
  ru: ["ниже", "выше", "дальше разберём", "в следующей секции", "в следующем разделе"],
  en: ["below", "above", "in the next section", "next we cover", "as shown above"],
};

/** A closing anchor carries a numeral, a currency/percent sign or a unit word. */
const CLOSING_ANCHOR = {
  ru: /(?:\d|%|\$|€|₽|руб|дн[ея]|дней|недел|месяц|час|минут|секунд|верси|ролик|кадр|сцен)/i,
  en: /(?:\d|%|\$|€|£|day|week|month|hour|minute|second|version|video|scene|frame|point)/i,
};

const ABBREVIATIONS = /(?:\bи т\.д\.|\bт\.е\.|\bт\.к\.|\bдр\.|\bнапр\.|etc\.|e\.g\.|i\.e\.)/i;

/** Strips the YAML frontmatter block. */
function stripFrontmatter(text) {
  return text.replace(/^---\r?\n[\s\S]*?\r?\n---/, "").trim();
}

/** Removes markdown link, image and emphasis syntax from a fragment. */
function cleanInline(fragment) {
  return fragment
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/`[^`]*`/g, "")
    .replace(/[*_]/g, "")
    .trim();
}

/** Splits a fragment into word tokens. */
function wordsOf(fragment) {
  return cleanInline(fragment)
    .split(/\s+/)
    .map((token) => token.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))
    .filter((token) => /[\p{L}\p{N}]/u.test(token));
}

/** Splits prose into sentences, ignoring decimals and common abbreviations. */
function sentencesOf(prose) {
  const text = cleanInline(prose).replace(/\s+/g, " ").trim();
  if (!text) return [];
  const out = [];
  let buffer = "";
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    buffer += char;
    if (!".!?…".includes(char)) continue;
    const previous = text[index - 1] ?? "";
    const next = text[index + 1] ?? "";
    const isDecimal = char === "." && /\d/.test(previous) && /\d/.test(next);
    if (isDecimal) continue;
    if (ABBREVIATIONS.test(buffer.trim())) continue;
    while (index + 1 < text.length && /[\s"»)]/.test(text[index + 1])) {
      buffer += text[index + 1];
      index += 1;
    }
    out.push(buffer.trim());
    buffer = "";
  }
  if (buffer.trim()) out.push(buffer.trim());
  return out.filter((sentence) => /[\p{L}\p{N}]/u.test(sentence));
}

/** Splits the body into H2 sections; the first carries the lead. */
function sectionsOf(body) {
  const sections = [{ heading: null, lines: [] }];
  for (const line of body.split(/\r?\n/)) {
    const match = /^##\s+(.*)$/.exec(line.trim());
    if (match) sections.push({ heading: match[1].trim(), lines: [] });
    else sections[sections.length - 1].lines.push(line);
  }
  return sections;
}

/** Prose paragraphs of a section: no headings, tables or list blocks. */
function paragraphsOf(section) {
  return section.lines
    .join("\n")
    .split(/\r?\n\s*\r?\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .filter((block) => {
      if (block.startsWith("#") || block.startsWith("|")) return false;
      return !/^([-*+]|\d+\.)\s/.test(block);
    });
}

/** Mean, population standard deviation and max of a numeric array. */
function stats(values) {
  if (values.length === 0) return { mean: 0, sd: 0, max: 0 };
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return {
    mean: Number(mean.toFixed(2)),
    sd: Number(Math.sqrt(variance).toFixed(2)),
    max: Math.max(...values),
  };
}

/** Splits a file path into slug and language. */
function identify(file) {
  const name = basename(file);
  const match = /^(.*)\.(ru|en)\.md$/.exec(name);
  if (!match) return { slug: name, lang: null };
  return { slug: match[1], lang: match[2] };
}

/** All measurable data for one article. */
function measure(file) {
  const { slug, lang } = identify(file);
  const body = stripFrontmatter(readFileSync(file, "utf8"));
  const sections = sectionsOf(body);

  const sectionReports = [];
  const paragraphSentenceCounts = [];
  const perParagraphSd = [];
  const sentenceLengths = [];
  let totalWords = 0;
  let paragraphCount = 0;
  let closingAnchors = 0;
  let tableRows = 0;
  let listItems = 0;
  let headings = 0;

  for (const line of body.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/^#{1,6}\s/.test(trimmed)) headings += 1;
    else if (trimmed.startsWith("|")) tableRows += 1;
    else if (/^([-*+]|\d+\.)\s/.test(trimmed)) listItems += 1;
  }

  for (const section of sections) {
    const paragraphs = paragraphsOf(section).map((block) => {
      const lengths = sentencesOf(block).map((sentence) => wordsOf(sentence).length);
      const wordCount = wordsOf(block).length;
      const closing = sentencesOf(block).at(-1) ?? "";
      return { wordCount, lengths, closing };
    });

    const density = paragraphs.map((paragraph) => paragraph.lengths.length);
    const adjacentDelta = [];
    for (let index = 0; index + 1 < paragraphs.length; index += 1) {
      adjacentDelta.push(Math.abs(paragraphs[index].wordCount - paragraphs[index + 1].wordCount));
    }

    for (const paragraph of paragraphs) {
      totalWords += paragraph.wordCount;
      paragraphCount += 1;
      paragraphSentenceCounts.push(paragraph.lengths.length);
      perParagraphSd.push(stats(paragraph.lengths).sd);
      for (const length of paragraph.lengths) sentenceLengths.push(length);
      if (paragraph.closing && CLOSING_ANCHOR[lang ?? "ru"].test(paragraph.closing)) {
        closingAnchors += 1;
      }
    }

    const lead = paragraphs[0];
    sectionReports.push({
      heading: section.heading,
      leadParagraph: lead
        ? { words: lead.wordCount, sentences: lead.lengths.length }
        : { words: 0, sentences: 0 },
      densityArray: density,
      adjacentDelta,
      sentenceSd: paragraphs.map((paragraph) => stats(paragraph.lengths).sd),
      closingAnchors: paragraphs.map((paragraph) =>
        paragraph.closing ? CLOSING_ANCHOR[lang ?? "ru"].test(paragraph.closing) : false,
      ),
      paragraphLengths: paragraphs.map((paragraph) => paragraph.wordCount),
    });
  }

  const frequencyMap = {};
  for (const count of paragraphSentenceCounts) {
    frequencyMap[count] = (frequencyMap[count] ?? 0) + 1;
  }

  const bridges = SPATIAL_BRIDGES[lang ?? "ru"]
    .map((keyword) => {
      const matches = body.toLowerCase().split(keyword).length - 1;
      return { keyword, matches };
    })
    .filter((entry) => entry.matches > 0);

  return {
    file,
    slug,
    lang,
    totalWords,
    totalSentences: sentenceLengths.length,
    totalParagraphs: paragraphCount,
    headings,
    tableRows,
    listItems,
    peakSentenceWords: sentenceLengths.length ? Math.max(...sentenceLengths) : 0,
    meanSentenceWords: stats(sentenceLengths).mean,
    sentenceSd: stats(sentenceLengths).sd,
    spatialBridgeFrequency: bridges.reduce((sum, entry) => sum + entry.matches, 0),
    spatialBridgeMatches: bridges,
    paragraphCountFrequencyMap: frequencyMap,
    closingAnchorRatio: paragraphCount ? Number((closingAnchors / paragraphCount).toFixed(2)) : 0,
    meanParagraphSd: stats(perParagraphSd).mean,
    sections: sectionReports,
    sentenceLengths,
  };
}

/** Pearson correlation of two numeric arrays on their shared prefix. */
function correlation(a, b) {
  const n = Math.min(a.length, b.length);
  if (n < 2) return null;
  const left = a.slice(0, n);
  const right = b.slice(0, n);
  const meanLeft = left.reduce((sum, value) => sum + value, 0) / n;
  const meanRight = right.reduce((sum, value) => sum + value, 0) / n;
  let covariance = 0;
  let varianceLeft = 0;
  let varianceRight = 0;
  for (let index = 0; index < n; index += 1) {
    const dl = left[index] - meanLeft;
    const dr = right[index] - meanRight;
    covariance += dl * dr;
    varianceLeft += dl * dl;
    varianceRight += dr * dr;
  }
  if (varianceLeft === 0 || varianceRight === 0) return null;
  return Number((covariance / Math.sqrt(varianceLeft * varianceRight)).toFixed(3));
}

function parseArgs(argv) {
  const files = [];
  const flags = { json: false, verbose: false };
  for (const arg of argv) {
    if (arg === "--json") flags.json = true;
    else if (arg === "--verbose") flags.verbose = true;
    else if (arg.startsWith("--")) {
      console.error(`unknown flag: ${arg}`);
      process.exit(1);
    } else files.push(arg);
  }
  return { files, flags };
}

function defaultFiles() {
  return readdirSync(ARTICLES_DIR)
    .filter((name) => name.endsWith(".ru.md") || name.endsWith(".en.md"))
    .sort()
    .map((name) => join(ARTICLES_DIR, name));
}

const { files, flags } = parseArgs(process.argv.slice(2));
const targets = files.length ? files : defaultFiles();

if (targets.length === 0) {
  console.error("no article files found");
  process.exit(1);
}

const reports = targets.map(measure);

/** Mirror metrics for a matched RU/EN pair. */
function mirrorMetrics(report) {
  const pairFile = report.file.replace(/\.(ru|en)\.md$/, (_, lang) =>
    lang === "ru" ? ".en.md" : ".ru.md",
  );
  if (!existsSync(pairFile) || report.lang !== "ru") return null;
  const other = measure(pairFile);
  const sentenceDelta = report.totalSentences
    ? Number(
        (
          (Math.abs(report.totalSentences - other.totalSentences) / report.totalSentences) *
          100
        ).toFixed(1),
      )
    : 0;
  const paragraphDelta = report.totalParagraphs
    ? Number(
        (
          (Math.abs(report.totalParagraphs - other.totalParagraphs) / report.totalParagraphs) *
          100
        ).toFixed(1),
      )
    : 0;
  return {
    en: pairFile,
    sentenceDelta,
    paragraphDelta,
    positionalCorrelation: correlation(report.sentenceLengths, other.sentenceLengths),
    comparedSentences: Math.min(report.totalSentences, other.totalSentences),
  };
}

for (const report of reports) {
  report.mirror = mirrorMetrics(report);
}

/** Prints a GitHub-flavoured markdown table. */
function markdownTable(headers, rows) {
  const line = (cells) => `| ${cells.join(" | ")} |`;
  console.log(line(headers));
  console.log(line(headers.map(() => "---")));
  for (const row of rows) console.log(line(row));
}

if (flags.json) {
  console.log(JSON.stringify(reports, null, 2));
} else {
  for (const report of reports) {
    console.log(`\n### ${report.file}\n`);
    markdownTable(
      ["Metric", "Value"],
      [
        ["Words (prose)", report.totalWords],
        ["Sentences", report.totalSentences],
        ["Paragraphs", report.totalParagraphs],
        ["Headings", report.headings],
        ["Table rows", report.tableRows],
        ["List items", report.listItems],
        ["Peak sentence, words", report.peakSentenceWords],
        ["Mean sentence, words", report.meanSentenceWords],
        ["Sentence SD", report.sentenceSd],
        ["Mean paragraph sentence SD", report.meanParagraphSd],
        ["Spatial bridges", report.spatialBridgeFrequency],
        ["Closing anchors", report.closingAnchorRatio],
      ],
    );
    console.log("");
    markdownTable(
      ["H2 section", "Lead w/s", "Density", "Adjacent delta", "Sentence SD"],
      report.sections.map((section) => [
        section.heading ?? "(lead)",
        `${section.leadParagraph.words}/${section.leadParagraph.sentences}`,
        section.densityArray.join(", ") || "-",
        section.adjacentDelta.join(", ") || "-",
        section.sentenceSd.join(", ") || "-",
      ]),
    );
    console.log("");
    markdownTable(
      ["Sentences in paragraph", "Paragraphs"],
      Object.entries(report.paragraphCountFrequencyMap).map(([count, total]) => [count, total]),
    );
    if (report.mirror) {
      console.log("");
      markdownTable(
        ["Mirror RU vs EN", "Value"],
        [
          ["Sentence delta", `${report.mirror.sentenceDelta}%`],
          ["Paragraph delta", `${report.mirror.paragraphDelta}%`],
          ["Positional r", report.mirror.positionalCorrelation ?? "n/a"],
          ["Compared sentences", report.mirror.comparedSentences],
        ],
      );
    } else if (report.lang === "ru") {
      console.log("\nNo EN pair.");
    }
    if (flags.verbose) {
      console.log(`\nSentence lengths: ${report.sentenceLengths.join(", ")}`);
      const bridges = report.spatialBridgeMatches.length
        ? report.spatialBridgeMatches.map((m) => `${m.keyword} x${m.matches}`).join(", ")
        : "0";
      console.log(`Spatial bridge matches: ${bridges}`);
    }
  }
}
