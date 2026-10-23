// Generation queue: the one list of images still to generate.
//
// The engine is storage only. It knows the record shape, the file, the per-kind
// image directories and the invariants (one record per `(kind, slug)`, a service
// or solution needs a Latin `object`). It knows nothing about the project's
// visual language: the composition normalizer is injected by the caller, because
// `docs/image-prompts/*` belongs to the project, not to the skill.
//
// A record's presence means "pending"; absence means the image exists.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { projectRoot } from "./project.mjs";

/** Queue file, project relative. */
export const QUEUE_FILE = "content/generation-queue.json";

/** Where each kind's image lives, project relative. */
export const KIND_DIRS = {
  article: "assets/images/articles",
  service: "assets/images/services",
  solution: "assets/images/solutions",
};

export const KINDS = Object.keys(KIND_DIRS);

/** Defaults for one call, so every function takes the same optional object. */
function options({ root = projectRoot(), file = QUEUE_FILE, kindDirs = KIND_DIRS } = {}) {
  return { root, file, kindDirs };
}

/** Absolute path of the queue file. */
export function queuePath(opts) {
  const { root, file } = options(opts);
  return join(root, file);
}

/** Project-relative target file for one entry (`<dir>/<slug>.png`). */
export function targetRel(kind, slug, opts) {
  const { kindDirs } = options(opts);
  const dir = kindDirs[kind];
  if (!dir) throw new Error(`unknown kind "${kind}" (expected ${KINDS.join(", ")})`);
  return `${dir}/${slug}.png`;
}

/** Absolute target file for one entry. */
export function targetPath(kind, slug, opts) {
  const { root } = options(opts);
  return join(root, targetRel(kind, slug, opts));
}

/** The line ending the queue file already uses, so a rewrite is not a whole-file diff. */
function eolFor(path) {
  try {
    return readFileSync(path, "utf8").includes("\r\n") ? "\r\n" : "\n";
  } catch {
    return "\n";
  }
}

/** Every entry, in file order. Empty when the file is missing or empty. */
export function readQueue(opts) {
  const path = queuePath(opts);
  if (!existsSync(path)) return [];
  const raw = readFileSync(path, "utf8").trim();
  if (!raw) return [];
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : [];
}

/** Write the whole queue back. */
export function writeQueue(entries, opts) {
  const path = queuePath(opts);
  const eol = eolFor(path);
  const text = JSON.stringify(entries, null, 2).replace(/\n/g, eol);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${text}${eol}`, "utf8");
}

/** The entry for `(kind, slug)`, or undefined. */
export function getEntry(kind, slug, opts) {
  return readQueue(opts).find((entry) => entry.kind === kind && entry.slug === slug);
}

/** Slugs still pending. Pass a kind to narrow. */
export function pendingSlugs(kind, opts) {
  return readQueue(opts)
    .filter((entry) => !kind || entry.kind === kind)
    .map((entry) => entry.slug);
}

/** Drop the `(kind, slug)` record. Returns how many rows were removed. */
export function removeEntry(kind, slug, opts) {
  const all = readQueue(opts);
  const next = all.filter((entry) => !(entry.kind === kind && entry.slug === slug));
  if (next.length === all.length) return 0;
  writeQueue(next, opts);
  return all.length - next.length;
}

/**
 * Merge a patch into an existing record. Throws when the record is missing, so a
 * typo in the slug never creates a half-record.
 */
export function updateEntry(kind, slug, patch, opts) {
  const all = readQueue(opts);
  const entry = all.find((item) => item.kind === kind && item.slug === slug);
  if (!entry) throw new Error(`no ${kind} entry for "${slug}" in the generation queue`);
  Object.assign(entry, patch);
  writeQueue(all, opts);
  return entry;
}

/** Set the structured `visual_config`, through the project's normalizer when given. */
export function setVisualConfig(kind, slug, config, { normalize, ...opts } = {}) {
  const next = normalize ? normalize(slug, config) : config;
  return updateEntry(kind, slug, { visual_config: next }, opts);
}

/**
 * Append a record. Throws on a duplicate `(kind, slug)` or a service/solution
 * without a Latin `object`.
 */
export function addEntry(entry, { normalize, ...opts } = {}) {
  if ((entry.kind === "solution" || entry.kind === "service") && !entry.object?.trim()) {
    throw new Error(`${entry.kind} "${entry.slug}" needs a non-empty Latin \`object\``);
  }
  const next = normalize
    ? { ...entry, visual_config: normalize(entry.slug, entry.visual_config) }
    : entry;
  const all = readQueue(opts);
  if (all.some((item) => item.kind === next.kind && item.slug === next.slug)) {
    throw new Error(`${next.kind} "${next.slug}" is already in the generation queue`);
  }
  all.push(next);
  writeQueue(all, opts);
  return next;
}
