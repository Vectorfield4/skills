#!/usr/bin/env node
// Jev review CLI for articles (skill: write-article).
//
// Usage:
//   node .opencode/skills/content/write-article/scripts/jev-review.mjs <slug> [--lang ru|en] [--json] [--advisory] [--gate]
//   node .opencode/skills/content/write-article/scripts/jev-review.mjs --stdin [--json] [--advisory]
//
// One batched Jev call per article: G1 (per-unit `noul` prose checklist), the
// Phase 4 sensors, G3 (genre/structure), G4 (AEO), G2 (links) and G7 (metadata),
// with a circuit-breaker `verdict`. The rubrics live in `./jev-article.mjs`, the
// runner in `lib/jev/chunked.mjs`; this file is wiring only.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { runChunkedReview } from "#lib/jev/chunked.mjs";
import { runReviewCli } from "#lib/jev/cli.mjs";
import { JevError } from "#lib/jev/client.mjs";
import {
  availableSensors,
  collectSensorFindings,
  sensorQuestions,
} from "#lib/jev/sensors.mjs";
import { filterFindings } from "#lib/prose/findings.mjs";
import { reviewText } from "#lib/prose/inline.mjs";
import {
  articleParagraphs,
  frontmatterField,
  splitFrontmatter,
} from "#lib/prose/markdown.mjs";
import { filterQuestions, relevanceQuestions } from "#lib/prose/prompts.mjs";
import { SENSORS } from "#lib/prose/sensors.mjs";
import {
  ARTICLE_PROMPT_VERSION,
  articleGlobalFindings,
  articleTargets,
  genreQuestion,
  leadQuestions,
  metaQuestions,
  structureQuestion,
} from "./jev-article.mjs";

const ROOT = process.cwd();
const read = (file) => (existsSync(file) ? readFileSync(file, "utf8") : "");
const rel = (file) => path.relative(ROOT, file).replace(/\\/g, "/");

/** Units per request: 20 units × (5 filters + sensors) stays under the ceiling. */
const UNIT_CHUNK = 20;

/** Query, persona and entity for the context-dependent sensors, from the plan row. */
function planContext(slug) {
  const dir = path.join(ROOT, "content", "plan");
  if (!existsSync(dir)) return {};
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".json") || name === "index.json") continue;
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(path.join(dir, name), "utf8"));
    } catch {
      continue;
    }
    const entry = (parsed.entries ?? []).find((item) => item.slug === slug);
    if (entry) {
      const link = (entry.links ?? [])[0] ?? "";
      return {
        query: entry.query ?? "",
        persona: entry.persona ?? "",
        entity: link.split(":")[1] ?? "",
      };
    }
  }
  return {};
}

/** Review a markdown article: G1 + sensors + G3/G4/G2/G7, with a verdict. */
export async function reviewArticle(slug, { lang = "ru" } = {}) {
  const file = path.join(ROOT, "articles", `${slug}.${lang}.md`);
  if (!existsSync(file)) throw new JevError("missing", `нет ${rel(file)}`);

  const source = read(file);
  const { frontmatter } = splitFrontmatter(source);
  const category = (frontmatterField(frontmatter, "category") ?? "").replace(/^["']|["']$/g, "");
  const units = articleParagraphs(source);
  const lead = units[0]?.text ?? "";
  const conclusion = units[units.length - 1]?.text ?? "";
  const document = units.map((u) => u.text).join("\n\n");
  const targets = articleTargets(frontmatter, lang);
  const context = planContext(slug);
  const meta = {
    meta_title: frontmatterField(frontmatter, "title") ?? "",
    meta_description: frontmatterField(frontmatter, "description") ?? "",
    meta_excerpt: frontmatterField(frontmatter, "excerpt") ?? "",
  };
  const sensors = availableSensors(SENSORS, { lead, conclusion, ...context });
  const unitSensors = sensors.filter((sensor) => sensor.scope === "unit");

  return runChunkedReview({
    kind: "article",
    slug,
    lang,
    file: rel(file),
    promptVersion: ARTICLE_PROMPT_VERSION,
    units,
    chunkSize: UNIT_CHUNK,
    describe: (current, global) => ({
      state: {
        units: current.map((u) => u.text),
        ...(global
          ? {
              document,
              title: meta.meta_title,
              description: meta.meta_description,
              excerpt: meta.meta_excerpt,
              declared_genre: category,
              lead,
              conclusion,
              persona: context.persona,
              query: context.query,
              entity: context.entity,
              targets: targets.map((t) => t.text ?? ""),
            }
          : {}),
      },
      questions: {
        ...filterQuestions(current.length),
        ...sensorQuestions(global ? sensors : unitSensors, current.length),
        ...(global
          ? {
              genre: genreQuestion(),
              structure: structureQuestion(),
              ...leadQuestions(),
              ...metaQuestions(),
              ...relevanceQuestions(targets.length),
            }
          : {}),
      },
      targets: global ? targets.length : 0,
      findingsFrom: (answers) => {
        const findings = [];
        filterFindings(current, answers, findings);
        collectSensorFindings(global ? sensors : unitSensors, current, answers, findings);
        if (global) articleGlobalFindings({ units, category, meta, answers, targets, findings });
        return findings;
      },
    }),
  });
}

await runReviewCli({
  review: reviewArticle,
  inline: (text, options) => reviewText("article", text, options),
  usage: [
    "usage: jev-review.mjs <slug> [--lang ru|en] [--json] [--advisory] [--gate]",
    "       jev-review.mjs --stdin [--lang ru|en] ...  (draft on stdin)",
  ],
});
