#!/usr/bin/env node
// Jev review CLI for services (skill: write-service).
//
// Usage:
//   node .opencode/skills/content/write-service/scripts/jev-review.mjs <slug> [--lang ru|en] [--json] [--advisory] [--gate]
//   node .opencode/skills/content/write-service/scripts/jev-review.mjs --stdin [--json] [--advisory]
//
// One batched Jev call per service: G1 (per-unit `noul` prose checklist),
// G2 (relevants) and G5 (mechanism, block titles, section items), with a
// circuit-breaker `verdict`. The rubrics live in `./jev-service.mjs`, the
// runner in `lib/jev/chunked.mjs`; this file is wiring only.

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { runChunkedReview } from "#lib/jev/chunked.mjs";
import { runReviewCli } from "#lib/jev/cli.mjs";
import { JevError } from "#lib/jev/client.mjs";
import { wordCount } from "#lib/jev/text.mjs";
import { filterFindings, relevanceFindings } from "#lib/prose/findings.mjs";
import { reviewText } from "#lib/prose/inline.mjs";
import { filterQuestions, relevanceQuestions } from "#lib/prose/prompts.mjs";
import { serviceBlocks, serviceStrings } from "./jev-lines.mjs";
import {
  blockFindings,
  mechanismQuestions,
  SERVICE_PROMPT_VERSION,
  sectionItemQuestions,
  serviceRelevants,
  titleQuestions,
} from "./jev-service.mjs";

const ROOT = process.cwd();
const read = (file) => (existsSync(file) ? readFileSync(file, "utf8") : "");
const rel = (file) => path.relative(ROOT, file).replace(/\\/g, "/");

/** Units per request: 20 units × 5 filters per the token ceiling. */
const UNIT_CHUNK = 20;
/** Per-unit state cap: keeps a long dictionary from bloating the request. */
const UNIT_CAP = 1200;
const cap = (text) => (text.length > UNIT_CAP ? `${text.slice(0, UNIT_CAP)}…` : text);

/** Review a service dictionary: G1 (filters), G2 (relevants), G5 (block semantics). */
export async function reviewService(slug, { lang = "ru" } = {}) {
  const file = path.join(ROOT, "src/entities/service/i18n", lang, `${slug}.ts`);
  if (!existsSync(file)) throw new JevError("missing", `нет ${rel(file)}`);

  const source = read(file);
  const units = serviceStrings(source).filter((u) => wordCount(u.text) >= 3);
  const targets = serviceRelevants(slug, lang);
  const blocks = serviceBlocks(source);
  const pairs = [];
  for (const key of Object.keys(blocks.titled)) {
    for (const item of blocks.titled[key]) {
      if (item.title && item.text) pairs.push(item);
    }
  }
  const sectionItems = blocks.sections.flatMap((section) => section.items);

  return runChunkedReview({
    kind: "service",
    slug,
    lang,
    file: rel(file),
    promptVersion: SERVICE_PROMPT_VERSION,
    units,
    chunkSize: UNIT_CHUNK,
    describe: (current, global) => ({
      state: {
        units: current.map((u) => cap(u.text)),
        ...(global
          ? {
              targets: targets.map((t) => t.text ?? ""),
              mechanisms: blocks.mechanism.map((m) => cap(m.text ?? "")),
              titleChecks: pairs.map((p) => `${p.title} — ${cap(p.text)}`),
              sectionItems: sectionItems.map((s) => cap(s.value)),
            }
          : {}),
      },
      questions: {
        ...filterQuestions(current.length),
        ...(global
          ? {
              ...relevanceQuestions(targets.length),
              ...mechanismQuestions(blocks.mechanism.length),
              ...titleQuestions(pairs.length),
              ...sectionItemQuestions(sectionItems.length),
            }
          : {}),
      },
      targets: global ? targets.length : 0,
      findingsFrom: (answers) => {
        const findings = [];
        filterFindings(current, answers, findings);
        if (global) {
          relevanceFindings(targets, answers, findings);
          blockFindings({ answers, blocks, pairs, sectionItems, findings });
        }
        return findings;
      },
    }),
  });
}

await runReviewCli({
  review: reviewService,
  inline: (text, options) => reviewText("service", text, options),
  usage: [
    "usage: jev-review.mjs <slug> [--lang ru|en] [--json] [--advisory] [--gate]",
    "       jev-review.mjs --stdin [--lang ru|en] ...  (draft on stdin)",
  ],
});
