// Catalog merge: gate verdicts + existing catalog -> products/catalog.json.
//
// The catalog is the project's tracked source of truth for what we sell. It
// carries no prices (those live in `data/<host>/prices.yaml`) and no prices can
// appear here: `stripPriceFields` runs on every entry, on every merge.

import { slugify, sortBySku, uniqueSorted } from "./stable.mjs";
import { FORBIDDEN_FIELDS } from "./payload.mjs";

const KEPT = [
  "sku",
  "name",
  "slug",
  "type",
  "status",
  "stock_status",
  "short_description",
  "description",
  "categories",
  "tags",
  "images",
  "source_url",
  "review_note",
];

/** Drops every price field from an entry (old catalogs carried them). */
export function stripPriceFields(product) {
  const out = {};
  for (const [key, value] of Object.entries(product ?? {})) {
    if (FORBIDDEN_FIELDS.includes(key)) continue;
    out[key] = value;
  }
  return out;
}

function names(list) {
  return uniqueSorted(
    (Array.isArray(list) ? list : []).map((item) => (typeof item === "string" ? item : item?.name)),
  );
}

function firstImage(product) {
  const list = Array.isArray(product?.images) ? product.images : [];
  const first = list[0];
  const src = typeof first === "string" ? first : first?.src;
  return String(src ?? "").trim();
}

function sentences(text, limit = 220) {
  const clean = String(text ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return "";
  const cut = clean.slice(0, limit);
  const stop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  return (stop > 60 ? cut.slice(0, stop + 1) : cut).trim();
}

export const TYPE_LABELS = {
  humanoid: "Гуманоид",
  quadruped: "Четырёхногий робот",
  cobot: "Кобот",
  manipulator: "Манипулятор",
  amr: "Мобильный робот",
  exoskeleton: "Экзоскелет",
  drone: "Дрон",
  soft: "Мягкий захват",
};

/** Short description from facts only: a Russian type + the model name, no marketing. */
export function shortDescriptionFor(item) {
  const types = Array.isArray(item?.types) ? item.types : [];
  const label = types.map((type) => TYPE_LABELS[type]).find(Boolean);
  const name = String(item?.name ?? "").trim();
  if (label && name) return `${label} ${name}.`;
  if (name) return `Робот ${name}.`;
  return names(item?.categories).join(", ");
}

/** Catalog entry for a gated candidate. `status` is the gate verdict, not a wish. */
export function catalogEntry(item, { now = new Date() } = {}) {
  const tags = names(item?.tags);
  const categories = names(item?.categories);
  const image = firstImage(item) || String(item?.image ?? "").trim();
  const status = item?.verdict === "publish" ? "publish" : "draft";
  const note = status === "publish" ? "" : (item?.reasons ?? []).join("; ");

  return {
    sku: String(item?.sku ?? "").trim(),
    name: String(item?.name ?? "").trim(),
    slug: slugify(item?.name ?? item?.sku ?? ""),
    type: "simple",
    status,
    stock_status: String(item?.stock_status ?? "onbackorder"),
    short_description: shortDescriptionFor({ ...item, categories }),
    description: sentences(item?.description, 1200),
    categories,
    tags,
    images: image ? [{ src: image }] : [],
    source_url: String(item?.url ?? item?.source_url ?? ""),
    review_note: note,
  };
}

/**
 * Merges gated items into the catalog. Existing entries keep their fields except
 * the ones the gate owns (status, tags, images, review_note); unknown keys are
 * dropped, so the file cannot accumulate junk. Output is sorted by sku.
 */
export function mergeCatalog({ catalog = [], items = [], now = new Date() } = {}) {
  const bySku = new Map();

  for (const raw of catalog ?? []) {
    const entry = stripPriceFields(raw);
    const sku = String(entry?.sku ?? "").trim();
    if (!sku) continue;
    bySku.set(sku, pick(entry));
  }

  const added = [];
  const updated = [];
  const untouched = [];

  for (const item of items ?? []) {
    const entry = catalogEntry(item, { now });
    if (!entry.sku) continue;
    const existing = bySku.get(entry.sku);
    if (!existing) {
      bySku.set(entry.sku, entry);
      added.push(entry.sku);
      continue;
    }
    const merged = {
      ...existing,
      ...entry,
      short_description: entry.short_description || existing.short_description,
      // Never replace a longer description with a shorter one: an update that
      // adds an image must not trade a Russian spec line for a slogan.
      description:
        String(existing.description ?? "").length > String(entry.description ?? "").length
          ? existing.description
          : entry.description || existing.description,
      categories: entry.categories.length ? entry.categories : existing.categories,
      tags: entry.tags.length ? entry.tags : existing.tags,
      images: entry.images.length ? entry.images : existing.images,
      source_url: entry.source_url || existing.source_url,
      review_note: entry.review_note || (existing.status === entry.status ? existing.review_note : ""),
    };
    if (JSON.stringify(merged) === JSON.stringify(existing)) untouched.push(entry.sku);
    else updated.push(entry.sku);
    bySku.set(entry.sku, merged);
  }

  const products = sortBySku([...bySku.values()]);
  return {
    catalog: { currency: "RUB", products },
    stats: { added, updated, untouched, total: products.length },
  };
}

function pick(entry) {
  const out = {};
  for (const key of KEPT) {
    if (entry?.[key] === undefined) continue;
    out[key] = entry[key];
  }
  if (Array.isArray(out.categories)) out.categories = names(out.categories);
  if (Array.isArray(out.tags)) out.tags = names(out.tags);
  if (!out.type) out.type = "simple";
  if (!out.stock_status) out.stock_status = "onbackorder";
  if (!Array.isArray(out.images)) out.images = [];
  if (out.review_note === undefined) out.review_note = "";
  return out;
}
