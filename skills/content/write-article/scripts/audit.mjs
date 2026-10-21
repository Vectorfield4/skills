#!/usr/bin/env node
// Readiness audit for publishing an article from draft (skill: write-article).
// Usage:
//   node .opencode/skills/content/write-article/scripts/audit.mjs [slug ...]
// With no slugs it audits every draft article: `draft` defaults to true in
// src/content.config.ts, so any article without `draft: false` is a draft.
// Exits non-zero while any hard blocker remains. The volume and cover numbers
// here mirror test/articles.test.ts; `npm run test` stays the source of truth.

import fs from "node:fs";
import path from "node:path";
import { getEntry } from "../../../../scripts/generation-queue.mjs";

const ROOT = process.cwd();
const ARTICLES = path.join(ROOT, "articles");
const IMAGES = path.join(ROOT, "assets", "images", "articles");

const TARGET_DIRS = {
  service: path.join(ROOT, "src/entities/service/model/fixtures"),
  solution: path.join(ROOT, "src/entities/solution/model/fixtures"),
  case: path.join(ROOT, "src/entities/case/model/fixtures"),
};

// Lower bound of the RU genre table in SKILL.md and the content plan.
const GENRE_RU_FLOOR = {
  product: 600,
  research: 900,
  technical: 1000,
  "case-study": 900,
  corporate: 600,
  industry: 900,
  media: 500,
  community: 500,
};

const EN_RATIO = 0.9;
const EXT = ["png", "jpg", "jpeg", "webp"];

// Live articles written before the genre floors existed; the floor is not
// retroactive. Mirrors GRANDFATHERED_FLOOR in test/articles.test.ts.
const GRANDFATHERED_FLOOR = new Set([
  "ai-agents-support-autonomy",
  "computer-vision-line-review",
  "conversational-bi-architecture",
  "deterministic-rag-infrastructure",
  "reviews-tone-monitoring",
]);

const read = (p) => (fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "");

const frontmatter = (text) => /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1] ?? "";
const body = (text) => text.replace(/^---\r?\n[\s\S]*?\r?\n---/, "");

function field(fm, key) {
  return new RegExp(`^${key}:\\s*(.+)$`, "m").exec(fm)?.[1]?.trim();
}

function slugList(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

/** Mirrors the schema default: draft unless `false`. */
function readDraft(fm) {
  const value = /^draft:\s*(true|false)\s*,?\s*$/m.exec(fm)?.[1];
  return value !== "false";
}

const readCategory = (fm) => field(fm, "category")?.replace(/^["']|["']$/g, "") || undefined;

const wordCount = (text) => text.split(/[^\p{L}\p{N}]+/u).filter(Boolean).length;

function articleSlugs() {
  return fs
    .readdirSync(ARTICLES)
    .filter((file) => file.endsWith(".ru.md"))
    .map((file) => file.replace(/\.ru\.md$/, ""))
    .sort();
}

function pngSize(file) {
  const buf = fs.readFileSync(file);
  const isPng = buf.length >= 24 && buf.toString("hex", 0, 8) === "89504e470d0a1a0a";
  if (!isPng) return { w: null, h: null };
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

function cover(slug) {
  for (const ext of EXT) {
    const file = path.join(IMAGES, `${slug}.${ext}`);
    if (fs.existsSync(file)) return { file, ...pngSize(file) };
  }
  return null;
}

const pending = (slug) => Boolean(getEntry("article", slug));

function targetPublished(type, slug) {
  const file = path.join(TARGET_DIRS[type] ?? "", `${slug}.ts`);
  if (!fs.existsSync(file)) return { ok: false, why: "не найден" };
  if (/draft:\s*true/.test(read(file))) return { ok: false, why: "draft" };
  return { ok: true, why: "" };
}

const RELEVANT_FIELDS = [
  ["service", "relatedServices"],
  ["solution", "relatedSolutions"],
  ["case", "relatedCases"],
];

function audit(slug) {
  const file = path.join(ARTICLES, `${slug}.ru.md`);
  const problems = [];
  const warnings = [];
  const notes = [];

  if (!fs.existsSync(file)) {
    return {
      slug,
      draft: true,
      problems: [`нет articles/${slug}.ru.md`],
      warnings,
      notes,
      cover: null,
      ru: 0,
      en: 0,
      refs: 0,
    };
  }

  const ru = read(file);
  const fm = frontmatter(ru);
  const draft = readDraft(fm);
  const category = readCategory(fm);
  if (!draft) notes.push("уже не draft");

  const cov = cover(slug);
  if (!cov) {
    problems.push("нет обложки");
    if (!pending(slug)) warnings.push("нет записи в content/generation-queue.json");
  } else if (cov.w && (cov.w < 1200 || cov.h < 630)) {
    problems.push(`обложка ${cov.w}x${cov.h} < 1200x630`);
  }

  const ruWords = wordCount(body(ru));
  const floor = category ? GENRE_RU_FLOOR[category] : undefined;
  if (!category) {
    problems.push("нет category — объём по жанру не проверяется");
  } else if (floor && !GRANDFATHERED_FLOOR.has(slug) && ruWords < floor) {
    problems.push(`RU ${ruWords}/${floor} по жанру ${category} (нужно +${floor - ruWords})`);
  }

  const enPath = path.join(ARTICLES, `${slug}.en.md`);
  const hasEn = fs.existsSync(enPath);
  const enWords = hasEn ? wordCount(body(read(enPath))) : 0;
  if (hasEn && enWords < ruWords * EN_RATIO) {
    problems.push(`EN ${enWords} < 90% RU ${ruWords}`);
  }

  let refs = 0;
  for (const [type, key] of RELEVANT_FIELDS) {
    for (const target of slugList(field(fm, key))) {
      refs++;
      const result = targetPublished(type, target);
      if (!result.ok) problems.push(`relevant ${type}:${target} — ${result.why}`);
    }
  }
  if (refs === 0) problems.push("нет связанных сущностей (relevants)");

  if (pending(slug)) notes.push("запись ещё в content/generation-queue.json");
  if (!problems.length) notes.push("prose-gate: прогнать prose-critic → VERDICT: PASS");

  return {
    slug,
    draft,
    category,
    cover: cov,
    ru: ruWords,
    en: enWords,
    refs,
    problems,
    warnings,
    notes,
  };
}

const args = process.argv.slice(2);
const slugs = args.length
  ? args
  : articleSlugs().filter((slug) =>
      readDraft(frontmatter(read(path.join(ARTICLES, `${slug}.ru.md`)))),
    );

if (!slugs.length) {
  console.log("Нет статей в draft — аудировать нечего.");
  process.exit(0);
}

let blocked = 0;
for (const slug of slugs) {
  const r = audit(slug);
  const art = r.cover ? `${r.cover.w ?? "?"}x${r.cover.h ?? "?"}` : "—";
  const ok = r.problems.length === 0;
  if (!ok) blocked++;
  console.log(
    `\n${ok ? "OK  " : "FAIL"} ${slug}  [draft=${r.draft} cat=${r.category ?? "—"} art=${art} RU=${r.ru} EN=${r.en} refs=${r.refs}]`,
  );
  for (const p of r.problems) console.log(`      ✗ ${p}`);
  for (const w of r.warnings) console.log(`      ⚠ ${w}`);
  for (const n of r.notes) console.log(`      · ${n}`);
}

console.log(`\n${slugs.length - blocked}/${slugs.length} готовы к выходу из draft.`);
process.exit(blocked ? 1 : 0);
