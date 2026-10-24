// Price ledger: the only place a price exists.
//
// Harvested prices stay in `data/<host>/prices.yaml` (gitignored) for the phone
// call. They are never sent to WooCommerce and never rendered on the site.

import { readListDoc, writeListDoc } from "./narrow-yaml.mjs";
import { runStamp } from "./stable.mjs";

export const SCALAR_ORDER = ["host", "updated_at"];
export const SECTION = "items";
export const FIELDS = ["brand", "model", "price", "currency", "source_url", "captured_at"];

function cleanPrice(value) {
  const text = String(value ?? "")
    .replace(/\s/g, "")
    .replace(",", ".");
  return /^\d+(?:\.\d+)?$/.test(text) ? text : "";
}

export function readPrices(file) {
  const doc = readListDoc(file);
  if (!doc) return null;
  return { host: doc.scalars.host ?? "", updated_at: doc.scalars.updated_at ?? "", items: doc.items };
}

export function writePrices(file, doc) {
  writeListDoc(
    file,
    {
      scalars: { host: doc.host ?? "", updated_at: doc.updated_at ?? runStamp() },
      section: SECTION,
      items: sortItems(doc.items),
    },
    SCALAR_ORDER,
  );
  return doc;
}

function sortItems(items) {
  return [...(items ?? [])].sort((a, b) => String(a?.sku ?? "").localeCompare(String(b?.sku ?? "")));
}

/**
 * Upserts harvested prices by sku: the newest capture wins, an empty price
 * (page has no public number) is recorded as empty rather than guessed.
 */
export function upsertPrices({ doc, items = [], capturedAt = runStamp(), host = "" } = {}) {
  const bySku = new Map();
  for (const item of doc?.items ?? []) {
    if (item?.sku) bySku.set(String(item.sku), item);
  }

  const recorded = [];
  for (const item of items ?? []) {
    const sku = String(item?.sku ?? "").trim();
    if (!sku) continue;
    const entry = {
      sku,
      brand: String(item.brand ?? "").trim(),
      model: String(item.name ?? item.model ?? "").trim(),
      price: cleanPrice(item.price),
      currency: String(item.currency ?? "").trim(),
      source_url: String(item.url ?? item.source_url ?? "").trim(),
      captured_at: capturedAt,
    };
    bySku.set(sku, entry);
    recorded.push(entry);
  }

  return {
    doc: { host: doc?.host ?? host, updated_at: capturedAt, items: sortItems([...bySku.values()]) },
    recorded: recorded.sort((a, b) => a.sku.localeCompare(b.sku)),
    withPrice: recorded.filter((item) => item.price !== "").length,
  };
}

/** Prices as a lookup, for premium scoring inside `shop-plan` (never printed). */
export function priceBySku(doc) {
  const map = new Map();
  for (const item of doc?.items ?? []) {
    if (item?.sku) map.set(String(item.sku), item);
  }
  return map;
}
