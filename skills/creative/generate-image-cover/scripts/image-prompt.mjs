#!/usr/bin/env node
/**
 * Builds an image-generation prompt into the folder where the image belongs, so
 * nobody assembles the fixed prompt by hand (or spends model tokens on it). The
 * one fixed template in `docs/image-prompts/scene-defined/image.txt` and one
 * style block in `docs/image-prompts/cover-style.txt`. This script fills the
 * slots from `content/generation-queue.json` and writes `<slug>.prompt.txt` next
 * to the image.
 *
 * The visual language is project data: `docs/image-prompts/*` and the queue file
 * are read from the project the script runs in, never imported from this repo.
 * A project without those modules gets a clear error, not a broken prompt.
 *
 * The pickers (`getNewsCover`, `getServiceImage`) glob only
 * `*.{png,jpg,jpeg,webp}`, so `.prompt.txt` files are ignored by the build.
 *
 * Usage:
 *   node <skill>/scripts/image-prompt.mjs article <slug> [--idea "..."] [--lang "..."] [--force] [--print]
 *   node <skill>/scripts/image-prompt.mjs service <slug> [--idea "..."] [--topic "..."] [--lang "..."] [--force] [--print]
 *   node <skill>/scripts/image-prompt.mjs solution <slug> [--idea "..."] [--lang "..."] [--force] [--print]
 *   node <skill>/scripts/image-prompt.mjs article --all [--force]
 *   node <skill>/scripts/image-prompt.mjs service --all [--force]
 *   node <skill>/scripts/image-prompt.mjs solution --all [--force]
 *
 * The visual idea comes from `visual_config`, with a deterministic composition
 * derived from the slug when no explicit override is present. Keywords add one
 * concrete motif for every kind. There is no entity-kind prompt branch or
 * legacy centered fallback. `--idea` overrides the scene for a one-off; an
 * entry with no `visual_config` gets a `[TODO: ...]` marker.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

import { KIND_DIRS, readQueue } from "#lib/generation-queue.mjs";
import { projectRoot } from "#lib/project.mjs";

const root = projectRoot();

/**
 * The project's visual language, loaded from `docs/image-prompts/`. Every module
 * is project data: composition staging, keyword motifs, UI primitives.
 */
async function loadVisualLanguage(projectDir) {
  const dir = join(projectDir, "docs/image-prompts");
  const files = ["composition.mjs", "keyword-motifs.mjs", "ui-primitives.mjs"];
  const missing = files.filter((file) => !existsSync(join(dir, file)));
  if (missing.length > 0) {
    throw new Error(
      `this project has no docs/image-prompts/${missing.join(", ")}; the visual language is project data`,
    );
  }

  const [composition, motifs, primitives] = await Promise.all(
    files.map((file) => import(pathToFileURL(join(dir, file)).href)),
  );
  return {
    compositionFor: composition.compositionFor,
    compositionKeyFor: composition.compositionKeyFor,
    resolveKeywordMotifs: motifs.resolveKeywordMotifs,
    resolveControlElements: primitives.resolveControlElements,
    resolveDisplayElements: primitives.resolveDisplayElements,
    resolveEmblem: primitives.resolveEmblem,
    VISUAL_COMPOSITIONS: primitives.VISUAL_COMPOSITIONS,
  };
}

const visual = await loadVisualLanguage(root);
const TEMPLATE = join(root, "docs/image-prompts/scene-defined/image.txt");
const STYLE_FILE = join(root, "docs/image-prompts/cover-style.txt");
/** Default {{LANG}} value; override with `--lang`. */
const DEFAULT_LANG = "neutral, no visible text on image";

const USAGE = `Usage:
  node <skill>/scripts/image-prompt.mjs article <slug> [--idea "..."] [--lang "..."] [--force] [--print]
  node <skill>/scripts/image-prompt.mjs service <slug> [--idea "..."] [--topic "..."] [--lang "..."] [--force] [--print]
  node <skill>/scripts/image-prompt.mjs solution <slug> [--idea "..."] [--lang "..."] [--force] [--print]
  node <skill>/scripts/image-prompt.mjs article --all [--force]
  node <skill>/scripts/image-prompt.mjs service --all [--force]
  node <skill>/scripts/image-prompt.mjs solution --all [--force]`;

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

/** `laser_prism` -> `laser prism`, so a token reads as prose inside the prompt. */
const humanize = (token) => String(token).replace(/_/g, " ");

/**
 * `visual_config` -> `{{VISUAL_IDEA}}`. The same composition pool and builder are
 * used for every entity kind; the slug deterministically fills a missing
 * composition, and there is no legacy centered fallback.
 */
const MAX_SCREENS = 3;

/** Compile one scene from the shared composition pool. */
function buildScene(config, slug) {
  const composition = visual.compositionFor(slug, config.composition);
  if (!composition) return undefined;
  const screens = visual
    .resolveDisplayElements(config.display_elements ?? [])
    .slice(0, MAX_SCREENS);
  const formation = composition.formation.replace("{{SCREENS}}", screens.join("; "));
  const controls = visual.resolveControlElements(config.control_layer ?? []);
  const controlText = controls.length
    ? ` Integrated into the physical slate body are organs of manual control: ${controls.join(", and ")}.`
    : "";
  const glow = humanize(config.environment_glow);
  // A domain `emblem` (a medical cross, a gear) replaces the abstract focal node.
  const focal =
    visual.resolveEmblem(config.emblem) ?? `a single polished ${humanize(config.focal_element)}`;

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
  const motifs = visual.resolveKeywordMotifs(keywords, 1);
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

if (!KIND_DIRS[kind] || (!all && !slug)) {
  console.error(USAGE);
  process.exit(1);
}

const entries = readQueue({ root }).filter((entry) => entry.kind === kind);
const targets = all ? entries : entries.filter((entry) => entry.slug === slug);
if (targets.length === 0) {
  console.error(`slug "${slug}" is not in the generation queue for kind "${kind}"`);
  process.exit(1);
}

const outDir = KIND_DIRS[kind];
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
    if (!visual.VISUAL_COMPOSITIONS[config.composition]) {
      config.composition = visual.compositionKeyFor(entry.slug);
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
  const outRel = join(outDir, `${entry.slug}.prompt.txt`);
  const outPath = join(root, outRel);
  if (existsSync(outPath) && !force) {
    written.push(`skip (exists): ${outRel}`);
    continue;
  }
  const values = valuesFor(entry, {
    visualIdea: compileVisualIdea(entry, idea),
    topic,
    lang,
    style,
  });
  const text = `${fill(template, values).trimEnd()}\n`;
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, text, "utf8");
  // Sidecar metadata next to the image; the pickers only read png/jpg/jpeg/webp.
  const metaRel = join(outDir, `${entry.slug}.meta.json`);
  writeFileSync(join(root, metaRel), `${JSON.stringify(toMeta(entry), null, 2)}\n`, "utf8");
  written.push(outRel, metaRel);
  if (print) console.log(`\n--- ${outRel} ---\n${text}`);
}

for (const path of written) console.log(path);
