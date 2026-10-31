// The one JSON codec of the repository.
//
// Every node reads and writes through this module, so a re-run on unchanged
// inputs produces byte-identical files and a diff proves it. Two write
// semantics live here and nowhere else:
//
//   stable  — sorted keys, the shop artifacts (`products/catalog.json`,
//             `data/<host>/*.json`) that `shop-report --diff` compares;
//   plain   — insertion order, the geo artifacts that are pushed to Overpass
//             and stay compact unless a caller asks for `indent`.
//
// `lib/shop/stable.mjs` and `lib/geo.mjs` re-export from here; they keep their
// own defaults so no artifact changes bytes.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

function sortDeep(value) {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value === null || typeof value !== "object") return value;
  const out = {};
  for (const key of Object.keys(value).sort()) {
    if (value[key] === undefined) continue;
    out[key] = sortDeep(value[key]);
  }
  return out;
}

/** Sorted-key JSON. Arrays keep their order: callers sort them by contract. */
export function stableStringify(value, { indent = 2 } = {}) {
  return JSON.stringify(sortDeep(value), null, indent);
}

export function sha256(text) {
  return createHash("sha256").update(String(text)).digest("hex");
}

/** Hash of a value's stable form: the memo key of every node. */
export function hashValue(value) {
  return sha256(stableStringify(value));
}

/** Parsed JSON. A UTF-8 BOM is stripped, because editors add one on Windows. */
export function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
}

/** Parsed JSON, or `fallback` when the file is absent. A broken file still throws. */
export function readJsonSafe(file, fallback = null) {
  if (!file || !existsSync(file)) return fallback;
  return readJson(file);
}

/**
 * The text a write would produce, without touching the disk.
 *
 * `indent` defaults to 2. Pass `indent: null` for the compact one-line form the
 * geo artifacts use; `undefined` would fall back to the default, so a caller
 * that wants compact has to say so.
 */
export function jsonText(value, { indent = 2, stable = false } = {}) {
  const text = stable ? stableStringify(value, { indent }) : JSON.stringify(value, null, indent);
  return `${text}\n`;
}

/** Writes ready text, creating directories and keeping one trailing newline. */
export function writeJsonFile(file, text) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text.endsWith("\n") ? text : `${text}\n`, "utf8");
  return text;
}

/** Writes a value as JSON. `stable: true` sorts keys; `indent: undefined` stays compact. */
export function writeJson(file, value, { indent = 2, stable = false } = {}) {
  return writeJsonFile(file, jsonText(value, { indent, stable }));
}
