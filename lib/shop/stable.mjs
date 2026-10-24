// Deterministic JSON: sorted keys, stable bytes, content hash.
//
// Every shop node writes through this helper, so a re-run on unchanged inputs
// produces byte-identical files and `shop-report --diff` can prove it.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/** Sorted-key JSON. Arrays keep their order: callers sort them by contract. */
export function stableStringify(value, { indent = 2 } = {}) {
  return JSON.stringify(sortDeep(value), null, indent);
}

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

export function sha256(text) {
  return createHash("sha256").update(String(text)).digest("hex");
}

/** Hash of a value's stable form: the memo key of every node. */
export function hashValue(value) {
  return sha256(stableStringify(value));
}

export function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
}

export function readJsonSafe(file, fallback = null) {
  if (!file || !existsSync(file)) return fallback;
  return readJson(file);
}

/** Writes stable JSON, creating directories and a trailing newline. */
export function writeJson(file, value) {
  mkdirSync(dirname(file), { recursive: true });
  const text = `${stableStringify(value)}\n`;
  writeFileSync(file, text, "utf8");
  return text;
}

/** Sort strings the way a human reads them, then by code point as a tie-break. */
export function compareText(left, right) {
  return String(left).localeCompare(String(right), "ru") || String(left).localeCompare(String(right));
}

export function sortBySku(products) {
  return [...(products ?? [])].sort((a, b) => compareText(a?.sku ?? "", b?.sku ?? ""));
}

/** `"Unitree G1"` -> `"unitree-g1"`, used for skus and file names. */
export function slugify(value) {
  return String(value ?? "")
    .toLowerCase()
    .replaceAll("ё", "е")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

/** Sorted unique strings. */
export function uniqueSorted(list) {
  return [...new Set((list ?? []).map((item) => String(item ?? "").trim()).filter(Boolean))].sort(
    compareText,
  );
}

/** First day of the current run, ISO without milliseconds: stable inside one run. */
export function runStamp(now = new Date()) {
  return new Date(now).toISOString().replace(/\.\d{3}Z$/, "Z");
}
