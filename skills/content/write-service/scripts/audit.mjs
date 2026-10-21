#!/usr/bin/env node
// Readiness audit for publishing a service from draft (skill: write-service).
// Usage:
//   node .opencode/skills/content/write-service/scripts/audit.mjs [slug ...]
// With no slugs it audits every service whose fixture has `draft: true`.
// Exits non-zero while any hard blocker remains. The prose gate here mirrors
// test/words.ts and test/services/prose-quality.test.ts; `npm run test` stays the
// source of truth.

import fs from "node:fs";
import path from "node:path";
import { getEntry } from "../../../../scripts/generation-queue.mjs";

const ROOT = process.cwd();
const SVC_FIXTURES = path.join(ROOT, "src/entities/service/model/fixtures");
const SVC_I18N = path.join(ROOT, "src/entities/service/i18n");
const BACKDROPS = path.join(ROOT, "assets/images/services");

const TARGET_DIRS = {
  service: SVC_FIXTURES,
  solution: path.join(ROOT, "src/entities/solution/model/fixtures"),
  case: path.join(ROOT, "src/entities/case/model/fixtures"),
};

const RU_MIN = 700;
const EN_RATIO = 0.9;
const EXT = ["png", "jpg", "jpeg", "webp"];

const read = (p) => (fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "");
const fixturePath = (slug) => path.join(SVC_FIXTURES, `${slug}.ts`);
const isDraft = (file) => /draft:\s*true/.test(read(file));

function allDraftSlugs() {
  return fs
    .readdirSync(SVC_FIXTURES)
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
    .map((f) => f.replace(/\.ts$/, ""))
    .filter((slug) => isDraft(fixturePath(slug)));
}

function backdrop(slug) {
  for (const ext of EXT) {
    const file = path.join(BACKDROPS, `${slug}.${ext}`);
    if (!fs.existsSync(file)) continue;
    return { file, ...pngSize(file) };
  }
  return null;
}

function pngSize(file) {
  const buf = fs.readFileSync(file);
  const isPng = buf.length >= 24 && buf.toString("hex", 0, 8) === "89504e470d0a1a0a";
  if (!isPng) return { w: null, h: null };
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

function wordCount(src) {
  const strings = [];
  const re = /"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'/g;
  for (const m of src.matchAll(re)) strings.push(m[1] ?? m[2]);
  return strings
    .join(" ")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean).length;
}

const words = (lang, slug) => wordCount(read(path.join(SVC_I18N, lang, `${slug}.ts`)));

function relevants(slug) {
  const src = read(fixturePath(slug));
  const i = src.indexOf("relevants: [");
  if (i < 0) return [];
  const out = [];
  for (const m of src.slice(i).matchAll(/type:\s*"(\w+)"\s*,\s*slug:\s*"([a-z0-9-]+)"/g)) {
    out.push({ type: m[1], slug: m[2] });
  }
  return out;
}

function targetPublished(ref) {
  const file = path.join(TARGET_DIRS[ref.type] ?? "", `${ref.slug}.ts`);
  if (!fs.existsSync(file)) return { ok: false, why: "не найден" };
  if (isDraft(file)) return { ok: false, why: "draft" };
  return { ok: true, why: "" };
}

const pending = (slug) => Boolean(getEntry("service", slug));

// Richness floors — mirror of test/services/service-richness.test.ts (source of truth).
// `diagram-resolves` lives only in the test; here diagrams are counted, not resolved.
function block(src, key) {
  const start = src.indexOf(`  ${key}: [`);
  if (start === -1) return null;
  let i = src.indexOf("[", start);
  const from = i;
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === "[") depth++;
    else if (src[i] === "]") {
      depth--;
      if (depth === 0) break;
    }
  }
  return src.slice(from, i + 1);
}

function countItems(text) {
  if (!text) return 0;
  let depth = 0;
  let n = 0;
  for (const ch of text) {
    if (ch === "{") {
      if (depth === 0) n++;
      depth++;
    } else if (ch === "}") depth--;
  }
  return n;
}

function richness(src) {
  const c = {};
  for (const key of [
    "features",
    "techStack",
    "processSteps",
    "fitItems",
    "proofItems",
    "faqItems",
    "outcomes",
    "mechanism",
    "scope",
    "tradeoffs",
    "deliverables",
    "relevants",
  ]) {
    c[key] = countItems(block(src, key));
  }
  const diagrams = (block(src, "mechanism")?.match(/diagram:/g) ?? []).length;
  const group = src.match(/group:\s*"([a-z-]+)"/)?.[1] ?? "";
  const hasNegative = (block(src, "fitItems") ?? "").includes("positive: false");
  const types = new Set(
    [...(block(src, "relevants") ?? "").matchAll(/type:\s*"(\w+)"/g)].map((m) => m[1]),
  );
  const specialty = ["tradeoffs", "outcomes", "mechanism", "scope", "deliverables"].filter(
    (k) => c[k] > 0,
  ).length;

  const bad = [];
  const soft = [];
  if (c.features < 4) bad.push("features>=4");
  if (c.processSteps < 4) bad.push("process>=4");
  if (c.fitItems < 2 || !hasNegative) bad.push("fit>=2+negative");
  if (c.proofItems < 2) soft.push("proof>=2");
  if (c.relevants < 3 || types.size < 2) bad.push("relevants>=3+2types");
  if (specialty < 2) bad.push("specialty>=2");
  if (c.outcomes + c.deliverables === 0) bad.push("result-block");
  if (c.faqItems < 4) bad.push("faq>=4");
  if (
    ["tradeoffs", "outcomes", "mechanism", "scope", "deliverables"].some(
      (k) => c[k] > 0 && c[k] < 3,
    )
  ) {
    bad.push("block>=3items");
  }
  if (["ml", "ai-infra"].includes(group) && !(c.mechanism > 0 && diagrams > 0)) {
    bad.push("ml/ai-infra:mechanism+diagram");
  }
  if (group === "ai-integrations" && c.deliverables === 0) bad.push("ai-integrations:deliverables");
  if (group === "ai-integrations" && c.tradeoffs === 0) bad.push("ai-integrations:tradeoffs");
  if (group === "engineering" && !(c.techStack > 0 && (c.scope > 0 || c.mechanism > 0))) {
    bad.push("engineering:techstack+(scope|mechanism)");
  }
  if (group === "web-growth" && c.outcomes === 0) bad.push("web-growth:outcomes");
  if (group === "training" && c.outcomes === 0) bad.push("training:outcomes");
  if (group === "training" && c.faqItems < 5) bad.push("training:faq>=5");
  return { errors: bad, warnings: soft };
}

function audit(slug) {
  const fix = fixturePath(slug);
  const src = read(fix);
  const problems = [];
  const warnings = [];
  const notes = [];

  const draft = /draft:\s*true/.test(src);
  if (!draft) notes.push("уже не draft");

  const bd = backdrop(slug);
  if (!bd) {
    problems.push("нет обложки");
  } else if (bd.w && (bd.w < 1200 || bd.h < 630)) {
    problems.push(`обложка ${bd.w}x${bd.h} < 1200x630`);
  }

  const ru = words("ru", slug);
  const en = words("en", slug);
  if (ru < RU_MIN) problems.push(`RU ${ru}/${RU_MIN} (нужно +${RU_MIN - ru})`);
  if (en < ru * EN_RATIO) problems.push(`EN ${en} < 90% RU ${ru}`);

  const refs = relevants(slug);
  for (const r of refs) {
    const t = targetPublished(r);
    if (!t.ok) problems.push(`relevant ${r.type}:${r.slug} — ${t.why}`);
  }

  const rich = richness(src);
  if (draft) {
    if (rich.errors.length) warnings.push(`richness: ${rich.errors.join(", ")}`);
  } else if (rich.errors.length) {
    problems.push(`richness: ${rich.errors.join(", ")}`);
  }
  if (rich.warnings.length) warnings.push(`richness (soft): ${rich.warnings.join(", ")}`);

  if (pending(slug)) notes.push("запись ещё в content/generation-queue.json");
  if (!problems.length) notes.push("prose-gate: прогнать service-critic → VERDICT: PASS");

  return { slug, draft, bd, ru, en, refs: refs.length, problems, warnings, notes };
}

const slugs = process.argv.slice(2).length ? process.argv.slice(2) : allDraftSlugs();
if (!slugs.length) {
  console.log("Нет сервисов в draft — аудировать нечего.");
  process.exit(0);
}

let blocked = 0;
for (const slug of slugs) {
  const r = audit(slug);
  const art = r.bd ? `${r.bd.w ?? "?"}x${r.bd.h ?? "?"}` : "—";
  const ok = r.problems.length === 0;
  if (!ok) blocked++;
  console.log(
    `\n${ok ? "OK  " : "FAIL"} ${slug}  [draft=${r.draft} art=${art} RU=${r.ru} EN=${r.en} refs=${r.refs}]`,
  );
  for (const p of r.problems) console.log(`      ✗ ${p}`);
  for (const w of r.warnings) console.log(`      ⚠ ${w}`);
  for (const n of r.notes) console.log(`      · ${n}`);
}

console.log(`\n${slugs.length - blocked}/${slugs.length} готовы к выходу из draft.`);
process.exit(blocked ? 1 : 0);
