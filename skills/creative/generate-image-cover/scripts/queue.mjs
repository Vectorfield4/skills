#!/usr/bin/env node
// Queue CLI: list, inspect and edit `content/generation-queue.json`.
//
// The storage engine lives in `lib/generation-queue.mjs`. The visual language is
// project data: when `docs/image-prompts/composition.mjs` exists, its composition
// key is derived for every record missing one, and legacy scene axes are dropped.
// Without that module the config is stored as given.

import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { isEntryPoint, parseFlags } from "#lib/cli.mjs";
import {
  addEntry,
  getEntry,
  KINDS,
  readQueue,
  removeEntry,
  setVisualConfig,
  updateEntry,
} from "#lib/generation-queue.mjs";
import { projectRoot } from "#lib/project.mjs";

const USAGE = `Usage:
  node <skill>/scripts/queue.mjs list [--kind article|service|solution] [--json]
  node <skill>/scripts/queue.mjs get <kind> <slug>
  node <skill>/scripts/queue.mjs add --kind <k> --slug <s> --title "<t>" --keywords "a, b" [--story "<s>"] [--topic "<t>"] [--object "<o>"] [--visual-config '<json>']
  node <skill>/scripts/queue.mjs remove <kind> <slug>
  node <skill>/scripts/queue.mjs set-story <kind> <slug> "<story>"
  node <skill>/scripts/queue.mjs set-topic <kind> <slug> "<topic>"
  node <skill>/scripts/queue.mjs set-object <kind> <slug> "<object>"
  node <skill>/scripts/queue.mjs set-keywords <kind> <slug> "a, b, c"
  node <skill>/scripts/queue.mjs set-visual-config <kind> <slug> '<json>'`;

const FLAGS = {
  json: "boolean",
  kind: "string",
  slug: "string",
  title: "string",
  keywords: "string",
  story: "string",
  topic: "string",
  object: "string",
  "visual-config": "string",
};

/**
 * The project's composition normalizer, or undefined when the project has no
 * image-prompt module. Read from the project, never imported from the skill.
 */
async function projectNormalizer(root) {
  const compositionFile = join(root, "docs/image-prompts/composition.mjs");
  if (!existsSync(compositionFile)) return undefined;

  const { compositionKeyFor } = await import(pathToFileURL(compositionFile).href);
  const primitivesFile = join(root, "docs/image-prompts/ui-primitives.mjs");
  const primitives = existsSync(primitivesFile)
    ? await import(pathToFileURL(primitivesFile).href)
    : {};
  const compositions = primitives.VISUAL_COMPOSITIONS ?? {};

  return (slug, config) => {
    if (!config) return config;
    const next = { ...config };
    delete next.topology;
    delete next.hardware_archetype;
    delete next.slot_locking;
    if (!compositions[next.composition]) next.composition = compositionKeyFor(slug);
    return next;
  };
}

function listWords(raw) {
  return (raw ?? "")
    .split(",")
    .map((word) => word.trim())
    .filter(Boolean);
}

async function main(argv) {
  const [command, ...rest] = argv;
  let flags;
  try {
    flags = parseFlags(rest, FLAGS);
  } catch (error) {
    console.error(`${error.message}\n\n${USAGE}`);
    process.exitCode = 1;
    return;
  }

  const root = projectRoot();
  const positional = flags._;
  const opts = { root };

  if (command === "list") {
    const entries = readQueue(opts).filter((entry) => !flags.kind || entry.kind === flags.kind);
    if (flags.json) {
      console.log(JSON.stringify(entries, null, 2));
      return;
    }
    for (const entry of entries) console.log(`${entry.kind}\t${entry.slug}\t${entry.title}`);
    console.log(`\n${entries.length} pending image(s).`);
    return;
  }

  if (command === "get") {
    const [kind, slug] = positional;
    const entry = getEntry(kind, slug, opts);
    if (!entry) {
      console.error(`no ${kind} entry for "${slug}"`);
      process.exitCode = 1;
      return;
    }
    console.log(JSON.stringify(entry, null, 2));
    return;
  }

  if (command === "remove") {
    const [kind, slug] = positional;
    const removed = removeEntry(kind, slug, opts);
    console.log(removed ? `removed ${kind} "${slug}"` : `no ${kind} entry for "${slug}"`);
    return;
  }

  if (command === "add") {
    if (!flags.kind || !KINDS.includes(flags.kind)) {
      console.error(`--kind must be one of ${KINDS.join(", ")}`);
      process.exitCode = 1;
      return;
    }
    if (!flags.slug) {
      console.error("--slug is required");
      process.exitCode = 1;
      return;
    }
    const entry = {
      kind: flags.kind,
      slug: flags.slug,
      title: flags.title ?? "",
      keywords: listWords(flags.keywords),
      story: flags.story ?? "",
    };
    if (flags.topic) entry.topic = flags.topic;
    if (flags.object) entry.object = flags.object;
    if (flags["visual-config"]) entry.visual_config = JSON.parse(flags["visual-config"]);
    addEntry(entry, { ...opts, normalize: await projectNormalizer(root) });
    console.log(`added ${flags.kind} "${flags.slug}"`);
    return;
  }

  const setters = {
    "set-story": (kind, slug, value) => updateEntry(kind, slug, { story: value }, opts),
    "set-topic": (kind, slug, value) => updateEntry(kind, slug, { topic: value }, opts),
    "set-object": (kind, slug, value) => updateEntry(kind, slug, { object: value }, opts),
    "set-keywords": (kind, slug, value) =>
      updateEntry(kind, slug, { keywords: listWords(value) }, opts),
  };

  if (command in setters) {
    const [kind, slug, value] = positional;
    setters[command](kind, slug, value ?? "");
    console.log(`${command.replace("set-", "set ")} for ${kind} "${slug}"`);
    return;
  }

  if (command === "set-visual-config") {
    const [kind, slug, json] = positional;
    setVisualConfig(kind, slug, JSON.parse(json ?? "{}"), {
      ...opts,
      normalize: await projectNormalizer(root),
    });
    console.log(`set visual_config for ${kind} "${slug}"`);
    return;
  }

  console.error(USAGE);
  process.exitCode = 1;
}

if (isEntryPoint(import.meta.url)) {
  try {
    await main(process.argv.slice(2));
  } catch (error) {
    console.error(`queue: ${error.message}`);
    process.exitCode = 1;
  }
}
