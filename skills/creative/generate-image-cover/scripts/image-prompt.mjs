#!/usr/bin/env node
/**
 * Builds an image-generation prompt into the folder where the image belongs, so
 * nobody assembles the fixed prompt by hand (or spends model tokens on it). The
 * one fixed template in `docs/image-prompts/scene-defined/image.txt` and one
 * style block in `docs/image-prompts/cover-style.txt`. This script fills the
 * slots from `content/generation-queue.json` and writes `<slug>.prompt.txt` next
 * to the image.
 *
 * The pickers (`getNewsCover`, `getServiceImage`) glob only
 * `*.{png,jpg,jpeg,webp}`, so `.prompt.txt` files are ignored by the build.
 *
 * Usage:
 *   node .opencode/skills/creative/generate-image-cover/scripts/image-prompt.mjs article <slug> [--idea "..."] [--lang "..."] [--force] [--print]
 *   node .opencode/skills/creative/generate-image-cover/scripts/image-prompt.mjs service <slug> [--idea "..."] [--topic "..."] [--lang "..."] [--force] [--print]
 *   node .opencode/skills/creative/generate-image-cover/scripts/image-prompt.mjs solution <slug> [--idea "..."] [--lang "..."] [--force] [--print]
 *   node .opencode/skills/creative/generate-image-cover/scripts/image-prompt.mjs article --all [--force]
 *   node .opencode/skills/creative/generate-image-cover/scripts/image-prompt.mjs service --all [--force]
 *   node .opencode/skills/creative/generate-image-cover/scripts/image-prompt.mjs solution --all [--force]
 *
 * The visual idea comes from `visual_config`, with a deterministic composition
 * derived from the slug when no explicit override is present. Keywords add one
 * concrete motif for every kind. There is no entity-kind prompt branch or
 * legacy centered fallback. `--idea` overrides the scene for a one-off; an
 * entry with no `visual_config` gets a `[TODO: ...]` marker.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { compositionFor, compositionKeyFor } from "../../../../docs/image-prompts/composition.mjs";
import { resolveKeywordMotifs } from "../../../../docs/image-prompts/keyword-motifs.mjs";
import {
  resolveControlElements,
  resolveDisplayElements,
  resolveEmblem,
  VISUAL_COMPOSITIONS,
} from "../../../../docs/image-prompts/ui-primitives.mjs";
import { readQueue } from "../../../../scripts/generation-queue.mjs";

const KINDS = {
  article: { outDir: "assets/images/articles" },
  service: { outDir: "assets/images/services" },
  solution: { outDir: "assets/images/solutions" },
};
const TEMPLATE = "docs/image-prompts/scene-defined/image.txt";
const STYLE_FILE = "docs/image-prompts/cover-style.txt";
/** Default {{LANG}} value; override with `--lang`. */
const DEFAULT_LANG = "neutral, no visible text on image";

const USAGE = `Usage:
  node .opencode/skills/creative/generate-image-cover/scripts/image-prompt.mjs article <slug> [--idea "..."] [--lang "..."] [--force] [--print]
  node .opencode/skills/creative/generate-image-cover/scripts/image-prompt.mjs service <slug> [--idea "..."] [--topic "..."] [--lang "..."] [--force] [--print]
  node .opencode/skills/creative/generate-image-cover/scripts/image-prompt.mjs solution <slug> [--idea "..."] [--lang "..."] [--force] [--print]
  node .opencode/skills/creative/generate-image-cover/scripts/image-prompt.mjs article --all [--force]
  node .opencode/skills/creative/generate-image-cover/scripts/image-prompt.mjs service --all [--force]
  node .opencode/skills/creative/generate-image-cover/scripts/image-prompt.mjs solution --all [--force]`;

function parseArgs(argv) {
  const flags = {
    idea: undefined,
    topic: undefined,
    lang: undefined,
    force: false,
    print: false,
    all: false,
  };
  const positional = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--idea") {
      index += 1;
      flags.idea = argv[index];
    } else if (arg === "--topic") {
      index += 1;
      flags.topic = argv[index];
    } else if (arg === "--lang") {
      index += 1;
      flags.lang = argv[index];
    } else if (arg === "--force") {
      flags.force = true;
    } else if (arg === "--print") {
      flags.print = true;
    } else if (arg === "--all") {
      flags.all = true;
    } else {
      positional.push(arg);
    }
  }
  return { ...flags, positional };
}

/** `laser_prism` → `laser prism`, so a token reads as prose inside the prompt. */
const humanize = (token) => String(token).replace(/_/g, " ");

/**
 * `visual_config` → `{{VISUAL_IDEA}}`. The same composition pool and builder are
 * used for every entity kind; the slug deterministically fills a missing
 * composition, and there is no legacy centered fallback.
 */
const MAX_SCREENS = 3;

/** Compile one scene from the shared composition pool. */
function buildScene(config, slug) {
  const composition = compositionFor(slug, config.composition);
  if (!composition) return undefined;
  const screens = resolveDisplayElements(config.display_elements ?? []).slice(0, MAX_SCREENS);
  const formation = composition.formation.replace("{{SCREENS}}", screens.join("; "));
  const controls = resolveControlElements(config.control_layer ?? []);
  const controlText = controls.length
    ? ` Integrated into the physical slate body are organs of manual control: ${controls.join(", and ")}.`
    : "";
  const glow = humanize(config.environment_glow);
  // A domain `emblem` (a medical cross, a gear) replaces the abstract focal node.
  const focal =
    resolveEmblem(config.emblem) ?? `a single polished ${humanize(config.focal_element)}`;

  const screenText = screens.length
    ? ` Exactly ${screens.length} translucent frosted glass panels support the physical scene: ${formation}.`
    : "";
  return `${composition.camera} ${composition.backdrop} The focal object, ${focal}, is the only saturated element in the frame: vivid crimson, ${composition.focal}, emitting a soft ${glow.startsWith("ambient") ? glow : `ambient ${glow}`}.${screenText}${controlText}`;
}

/**
 * `{{VISUAL_IDEA}}` precedence: a one-off `--idea`, then the structured
 * composition. The deprecated free-form `story` no longer drives prompts.
 */
function compileVisualIdea(entry, override) {
  if (override) return override;
  const config = entry.visual_config;
  if (config) return `${buildScene(config, entry.slug)}${motifSentence(entry.keywords)}`;
  return `[TODO: visual_config for "${entry.slug}"]`;
}

/** Add one concrete motif; the composition and subject remain primary. */
function motifSentence(keywords) {
  const motifs = resolveKeywordMotifs(keywords, 1);
  return motifs.length ? ` A small supporting detail is ${motifs[0]}.` : "";
}

function fill(template, values) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => values[key] ?? `[TODO: ${key}]`);
}

/** Shared slot values; the prompt has no entity-kind branches. */
function valuesFor(entry, { visualIdea, topic, lang, style }) {
  const subject = topic?.trim() || entry.topic?.trim() || entry.keywords.join(" ");
  const object = entry.object?.trim() || subject;
  return {
    SUBJECT: subject,
    OBJECT: object,
    VISUAL_IDEA: visualIdea,
    STYLE: style,
    LANG: lang ?? DEFAULT_LANG,
  };
}

const { idea, topic, lang, force, print, all, positional } = parseArgs(process.argv.slice(2));
const [kind, slug] = positional;
const spec = KINDS[kind];

if (!spec || (!all && !slug)) {
  console.error(USAGE);
  process.exit(1);
}

const entries = readQueue().filter((entry) => entry.kind === kind);
const targets = all ? entries : entries.filter((entry) => entry.slug === slug);
if (targets.length === 0) {
  console.error(`slug "${slug}" is not in the generation queue for kind "${kind}"`);
  process.exit(1);
}

const template = readFileSync(TEMPLATE, "utf8");
const style = readFileSync(STYLE_FILE, "utf8").trimEnd();
/**
 * The record's metadata, minus empties, as the sidecar the asset ships with.
 * The visual config is normalized: legacy axes are dropped and the composition
 * that actually drove the prompt is written down.
 */
function toMeta(entry) {
  const config = entry.visual_config ? { ...entry.visual_config } : null;
  if (config) {
    delete config.topology;
    delete config.hardware_archetype;
    delete config.slot_locking;
    if (!VISUAL_COMPOSITIONS[config.composition]) {
      config.composition = compositionKeyFor(entry.slug);
    }
  }
  const meta = {
    kind: entry.kind,
    slug: entry.slug,
    title: entry.title,
    keywords: entry.keywords,
    topic: entry.topic ?? "",
    object: entry.object ?? "",
    visual_config: config,
  };
  if (entry.story?.trim()) meta.story = entry.story;
  return meta;
}

const written = [];
for (const entry of targets) {
  const outPath = join(spec.outDir, `${entry.slug}.prompt.txt`);
  if (existsSync(outPath) && !force) {
    written.push(`skip (exists): ${outPath}`);
    continue;
  }
  const values = valuesFor(entry, {
    visualIdea: compileVisualIdea(entry, idea),
    topic,
    lang,
    style,
  });
  const text = `${fill(template, values).trimEnd()}\n`;
  writeFileSync(outPath, text, "utf8");
  // Sidecar metadata next to the image; the pickers only read png/jpg/jpeg/webp.
  const metaPath = join(spec.outDir, `${entry.slug}.meta.json`);
  writeFileSync(metaPath, `${JSON.stringify(toMeta(entry), null, 2)}\n`, "utf8");
  written.push(outPath, metaPath);
  if (print) console.log(`\n--- ${outPath} ---\n${text}`);
}

for (const path of written) console.log(path);
