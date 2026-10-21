#!/usr/bin/env node
// Publish an article from draft (skill: write-article).
// Usage:
//   node .opencode/skills/content/write-article/scripts/publish.mjs [--dry-run] [--force] [--jev] <slug ...>
// Runs the readiness audit first and skips a slug that is not ready unless
// --force is passed. With --jev it also runs the advisory Jev review
// (./jev-review.mjs) and skips a slug that returns candidates, unless
// --force. Then does the mechanical edits, in the same change:
//   - set `draft: false` in <slug>.ru.md and <slug>.en.md (the schema default is true);
//   - drop the slug's record from content/generation-queue.json.
// It does not run the build; run `npm run lint && npm run test && npm run verify`
// afterwards.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { labelPublished } from "#lib/jev/calibration-log.mjs";
import { removeEntry } from "../../../../scripts/generation-queue.mjs";

const ROOT = process.cwd();
const ARTICLES = path.join(ROOT, "articles");
const AUDIT = fileURLToPath(new URL("./audit.mjs", import.meta.url));
const REVIEW = fileURLToPath(new URL("./jev-review.mjs", import.meta.url));

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const force = args.includes("--force");
const jev = args.includes("--jev");
const slugs = args.filter((arg) => !arg.startsWith("--"));

if (!slugs.length) {
  console.error("Укажите хотя бы один slug: publish.mjs [--dry-run] [--force] <slug ...>");
  process.exit(1);
}

const eolOf = (src) => (src.includes("\r\n") ? "\r\n" : "\n");
const rel = (file) => path.relative(ROOT, file);

/** `draft` defaults to true, so an article publishes only with an explicit false. */
function setDraftFalse(file) {
  if (!fs.existsSync(file)) {
    console.log(`   нет файла — ${rel(file)}`);
    return;
  }
  const src = fs.readFileSync(file, "utf8");
  const lines = src.split(/\r?\n/);
  const idx = lines.findIndex((line) => /^\s*draft:\s*(true|false)\s*,?\s*$/.test(line));
  if (idx !== -1 && /^\s*draft:\s*false\s*,?\s*$/.test(lines[idx])) {
    console.log(`   draft уже false — ${rel(file)}`);
    return;
  }
  if (idx !== -1) {
    lines[idx] = lines[idx].replace("true", "false");
  } else {
    const open = lines.findIndex((line) => line.trim() === "---");
    if (open === -1) {
      console.error(`   нет frontmatter — ${rel(file)}`);
      return;
    }
    lines.splice(open + 1, 0, "draft: false");
  }
  if (!dryRun) fs.writeFileSync(file, lines.join(eolOf(src)));
  console.log(`   draft: false — ${rel(file)}`);
}

let changed = 0;
for (const slug of slugs) {
  const audit = spawnSync(process.execPath, [AUDIT, slug], { encoding: "utf8" });
  if (audit.status !== 0 && !force) {
    console.log(`\nSKIP ${slug} — аудит не пройден (посмотри audit.mjs или --force).`);
    continue;
  }

  if (jev) {
    const review = spawnSync(process.execPath, [REVIEW, slug], { encoding: "utf8" });
    if (review.stdout?.trim()) console.log(`\n${review.stdout.trim()}`);
    if (review.status === 1 && !force) {
      console.log(`SKIP ${slug} — Jev нашёл кандидатов (--force чтобы игнорировать).`);
      continue;
    }
    if (review.status === 2)
      console.log("Jev: пропущен (ошибка вызова) — публикация продолжается.");
  }

  console.log(`\nPUBLISH ${slug}${dryRun ? " (dry-run)" : ""}`);
  setDraftFalse(path.join(ARTICLES, `${slug}.ru.md`));
  setDraftFalse(path.join(ARTICLES, `${slug}.en.md`));
  if (!dryRun) {
    // Label this slug's recorded firings: an edited unit is `real`, an intact
    // one is a false alarm. Feeds the sensor calibration corpus.
    const ruFile = path.join(ARTICLES, `${slug}.ru.md`);
    if (fs.existsSync(ruFile)) {
      labelPublished({ kind: "article", slug, lang: "ru", body: fs.readFileSync(ruFile, "utf8") });
    }
    removeEntry("article", slug);
  }
  console.log(`   ${dryRun ? "уберёт" : "убрал"} запись — content/generation-queue.json`);
  changed++;
}

console.log(
  `\n${dryRun ? "План" : "Готово"}: ${changed}/${slugs.length}. Далее: npm run lint && npm run test && npm run verify`,
);
