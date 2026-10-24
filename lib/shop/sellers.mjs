// Brand allowlist: our internal trustworthy signal, never rendered.
//
// `data/<host>/sellers.yaml` is a local file (gitignored). The tracked example
// seeds it on the first run, so a fresh clone still has a starting list.

import { existsSync } from "node:fs";
import { normalizeTag } from "../product-match.mjs";
import { indexItems, readListDoc, writeListDoc } from "./narrow-yaml.mjs";
import { runStamp } from "./stable.mjs";

export const SCALAR_ORDER = ["host", "updated_at"];
export const SECTION = "items";
export const KINDS = ["brand", "seller"];

export function normalizeDomain(value) {
  return String(value ?? "")
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "")
    .toLowerCase();
}

/** Sellers sorted by name, duplicates by domain dropped. */
export function normalizeSellers(items) {
  const seen = new Map();
  for (const item of items ?? []) {
    const name = String(item?.name ?? "").trim();
    const domain = normalizeDomain(item?.domain);
    if (!name || !domain) continue;
    const kind = KINDS.includes(String(item?.kind)) ? String(item.kind) : "brand";
    const key = domain;
    if (seen.has(key)) continue;
    seen.set(key, {
      name,
      domain,
      kind,
      flagship: String(item?.flagship ?? "").trim(),
      note: String(item?.note ?? "").trim(),
    });
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name, "ru"));
}

export function readSellersDoc(file) {
  const doc = readListDoc(file);
  if (!doc) return null;
  return { ...doc.scalars, items: normalizeSellers(doc.items) };
}

export function writeSellersDoc(file, doc) {
  writeListDoc(
    file,
    {
      scalars: { host: doc.host ?? "", updated_at: doc.updated_at ?? runStamp() },
      section: SECTION,
      items: normalizeSellers(doc.items),
    },
    SCALAR_ORDER,
  );
  return doc;
}

/** First run: seed from the tracked example, stamp the host. */
export function initSellers({ file, example, host }) {
  if (existsSync(file)) return { created: false, doc: readSellersDoc(file) };
  const seeded = example && existsSync(example) ? readSellersDoc(example) : null;
  const doc = {
    host: host ?? seeded?.host ?? "",
    updated_at: runStamp(),
    items: normalizeSellers(seeded?.items ?? []),
  };
  writeSellersDoc(file, doc);
  return { created: true, doc };
}

/** Allowlist lookup by brand name or domain. Brand matching is normalized. */
export function findSeller(items, { brand = "", domain = "" } = {}) {
  const wantedBrand = normalizeTag(brand);
  const wantedDomain = normalizeDomain(domain);
  for (const item of items ?? []) {
    if (wantedDomain && item.domain === wantedDomain) return item;
    if (wantedBrand && normalizeTag(item.name) === wantedBrand) return item;
  }
  return null;
}

export function flagshipOf(item) {
  return String(item?.flagship ?? "")
    .split(",")
    .map((model) => normalizeTag(model))
    .filter(Boolean);
}
