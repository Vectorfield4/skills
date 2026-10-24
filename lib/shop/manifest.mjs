// Run manifest: the memo table that makes the second run cheap.
//
// Every node records the hash of its inputs and the hash of its output. A node
// whose inputs hash matches the previous run is skipped, and `shop-report
// --diff` can prove that the catalog did not change a byte.

import { existsSync } from "node:fs";
import { join } from "node:path";
import { hashValue, readJsonSafe, runStamp, writeJson } from "./stable.mjs";

export function runDir(root, stamp = runStamp()) {
  return join(root, "runs", stamp.replace(/[:.]/g, "-"));
}

export function openRun({ dir, host = "", tree = [] }) {
  const manifest = readJsonSafe(join(dir, "manifest.json"), null) ?? {
    host,
    dir,
    started_at: runStamp(),
    previous: null,
    tree,
    nodes: {},
  };
  return { dir, manifest };
}

export function inputsHash(inputs) {
  return hashValue(inputs ?? {});
}

/** Reuse verdict: the same node ran before with the same inputs and succeeded. */
export function reuseNode(manifest, node, inputs) {
  const previous = manifest?.nodes?.[node];
  if (!previous) return { reuse: false, reason: "never-ran" };
  if (previous.status !== "ok") return { reuse: false, reason: `last status ${previous.status}` };
  const hash = inputsHash(inputs);
  if (previous.inputs !== hash) return { reuse: false, reason: "inputs changed" };
  return { reuse: true, reason: "inputs unchanged", outputs: previous.outputs ?? null, hash };
}

const VOLATILE_KEYS = new Set([
  "generated_at",
  "fetched_at",
  "checked_at",
  "captured_at",
  "updated_at",
  "synced_at",
  "at",
]);

function withoutVolatile(value) {
  if (Array.isArray(value)) return value.map(withoutVolatile);
  if (value === null || typeof value !== "object") return value;
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (VOLATILE_KEYS.has(key)) continue;
    out[key] = withoutVolatile(item);
  }
  return out;
}

export function recordNode(manifest, node, { inputs, outputs = {}, status = "ok", ms = 0, requests = 0, note = "" }) {
  manifest.nodes[node] = {
    inputs: inputsHash(inputs),
    outputs: hashValue(withoutVolatile(outputs)),
    status,
    ms: Math.max(0, Math.round(ms)),
    requests: Math.max(0, Math.round(requests)),
    note,
    at: runStamp(),
  };
  return manifest;
}

export function skillNode(manifest, node, { status = "ok", ms = 0, note = "" }) {
  manifest.nodes[node] = { status, ms, note, at: runStamp() };
  return manifest;
}

export function saveRun({ dir, manifest }) {
  writeJson(join(dir, "manifest.json"), manifest);
  return manifest;
}

export function loadManifest(dir) {
  const file = join(dir, "manifest.json");
  return existsSync(file) ? readJsonSafe(file) : null;
}

/** Node names in tree order, so reports read like the pipeline. */
export function nodeOrder(manifest) {
  const tree = manifest?.tree ?? [];
  const known = new Set(tree);
  const extra = Object.keys(manifest?.nodes ?? {}).filter((node) => !known.has(node));
  return [...tree, ...extra.sort()];
}
