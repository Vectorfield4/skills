// Deterministic JSON for the shop nodes: sorted keys, stable bytes, content hash.
//
// Every shop node writes through this helper, so a re-run on unchanged inputs
// produces byte-identical files and `shop-report --diff` can prove it. The codec
// itself lives in `#lib/json.mjs`; this module keeps the shop defaults and the
// text helpers that only the shop needs.

export { hashValue, readJson, readJsonSafe, sha256, stableStringify } from "#lib/json.mjs";

import { jsonText, writeJsonFile } from "#lib/json.mjs";

/** Writes stable JSON, creating directories and a trailing newline. */
export function writeJson(file, value) {
  return writeJsonFile(file, jsonText(value, { stable: true }));
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
