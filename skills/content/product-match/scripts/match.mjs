#!/usr/bin/env node
// Products for a news article: match by tag, copy the image, caption = model name.
//
//   node scripts/match.mjs --article articles/<slug>.ru.md \
//     --registry data/<host>/tags.yaml --catalog products/catalog.json \
//     [--store https://example.com] [--aliases data/<host>/tag-aliases.json] \
//     [--copy-images] [--assets public/images/products] [--limit 3] \
//     [--out docs/research/product-match-<slug>.json] [--no-record]
//
//   node scripts/match.mjs --tags "гуманоиды,коботы" [same flags]
//
// Reading the article tags records them in the registry: count + 1 and
// latestUpdate = now (skip with --no-record). The registry is never refreshed
// from here — a stale file is reported, and the refresh belongs to the
// WordPress skill through the product-scout agent.
//
// Exit 0 — at least one product matched, 1 — none, 2 — error.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { isEntryPoint, parseFlags } from "#lib/cli.mjs";
import {
  DEFAULT_ASSETS,
  DEFAULT_LIMIT,
  assetUrl,
  fetchImage,
  fetchStoreProducts,
  figureHtml,
  formatAge,
  hostFromUrl,
  imageFileName,
  matchProducts,
  mergeProducts,
  readArticle,
  readCatalog,
  readJsonFile,
  readRegistry,
  recordTags,
  registryStatus,
  splitTags,
  writeRegistry,
} from "#lib/product-match.mjs";

const USAGE = `Usage:
  node scripts/match.mjs --article articles/<slug>.ru.md [flags]
  node scripts/match.mjs --tags "тег,тег" [flags]

Flags:
  --registry <file>       tag registry, data/<host>/tags.yaml (optional but recommended)
  --catalog <file>        project catalog, default products/catalog.json
  --store <url>           WooCommerce Store API base URL (published products, live images)
  --aliases <file>        JSON map canonical tag -> spellings (default data/<host>/tag-aliases.json)
  --copy-images           download images into --assets and fill a <figure> per match
  --assets <dir>          image directory, default public/images/products
  --limit <n>             how many products to return, default 3
  --out <file>            write the JSON report there instead of stdout
  --no-record             do not bump tag counters in the registry
  --now <iso>             freeze the clock (tests, replays)`;

const SPEC = {
  article: "string",
  tags: "string",
  registry: "string",
  catalog: "string",
  store: "string",
  aliases: "string",
  assets: "string",
  limit: "number",
  out: "string",
  host: "string",
  now: "string",
  "copy-images": "boolean",
  "no-record": "boolean",
  help: "boolean",
};

function slugOf(file) {
  return String(file ?? "")
    .replace(/\\/g, "/")
    .split("/")
    .pop()
    .replace(/\.(ru|en)\.md$/, "")
    .replace(/\.md$/, "");
}

function readAliases(flags, host) {
  const explicit = flags.aliases ? resolve(flags.aliases) : null;
  if (explicit && !existsSync(explicit)) throw new Error(`${flags.aliases}: alias map not found`);

  const fallback = host ? resolve("data", host, "tag-aliases.json") : null;
  const file = explicit ?? (fallback && existsSync(fallback) ? fallback : null);
  if (!file) return { file: null, aliases: {} };

  try {
    const data = readJsonFile(file);
    return { file, aliases: data && typeof data === "object" && !Array.isArray(data) ? data : {} };
  } catch (error) {
    throw new Error(`${file}: invalid alias map (${error?.message ?? error})`);
  }
}

async function copyImages(matches, { assets }) {
  const copied = [];
  const reused = [];
  const errors = [];

  for (const match of matches) {
    const remote = match.image;
    if (!remote) continue;
    const fileName = imageFileName(match.sku, match.name, remote);
    const target = join(resolve(assets), fileName);
    const url = assetUrl(assets, fileName);

    if (existsSync(target)) {
      reused.push(target);
    } else {
      try {
        const bytes = await fetchImage(remote);
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, bytes);
        copied.push({ file: target, bytes: bytes.length });
      } catch (error) {
        errors.push(`${match.name}: ${error?.message ?? error}`);
        match.image = { remote, file: null, url: null };
        continue;
      }
    }

    match.image = { remote, file: target, url };
    match.figure = figureHtml({ caption: match.name, url });
  }

  return { copied, reused, errors };
}

export async function run(argv = process.argv.slice(2)) {
  let flags;
  try {
    const parsed = parseFlags(argv, SPEC);
    flags = parsed;
  } catch (error) {
    console.error(`error: ${error?.message ?? error}`);
    return 2;
  }

  if (flags.help) {
    console.log(USAGE);
    return 0;
  }

  try {
    const now = flags.now ? new Date(flags.now) : new Date();
    const warnings = [];

    const article = flags.article
      ? readArticle(readFileSync(resolve(flags.article), "utf8"))
      : { title: "", tags: [], body: "" };

    const tags = flags.tags ? splitTags(flags.tags) : article.tags;
    if (tags.length === 0) {
      throw new Error(
        flags.article
          ? `${flags.article}: no tags in frontmatter — add them or pass --tags`
          : "no tags: pass --tags \"тег,тег\" or --article <file>",
      );
    }

    const registryFile = flags.registry ? resolve(flags.registry) : null;
    let registry = registryFile ? readRegistry(registryFile) : null;
    const host =
      (flags.host ? hostFromUrl(flags.host) : "") ||
      registry?.host ||
      (flags.store ? hostFromUrl(flags.store) : "");

    const status = registryStatus(registry, { now });
    if (!status.fresh) {
      warnings.push(
        `tag registry ${status.reason === "stale" ? `is ${formatAge(status.ageMinutes)} old` : status.reason}: refresh through the WordPress skill (ewpa/get-tags) and \`tags.mjs sync\``,
      );
    }

    let recorded = [];
    if (registryFile && !flags["no-record"]) {
      const result = recordTags(registry, tags, { now, host: host || undefined });
      registry = writeRegistry(registryFile, result.registry);
      recorded = result.recorded;
    }

    const catalogFile = resolve(flags.catalog ?? "products/catalog.json");
    const catalog = existsSync(catalogFile) ? readCatalog(catalogFile) : [];
    if (catalog.length === 0) warnings.push(`no catalog at ${catalogFile}`);

    let store = [];
    if (flags.store) {
      try {
        store = await fetchStoreProducts(flags.store);
      } catch (error) {
        warnings.push(`store ${flags.store}: ${error?.message ?? error}`);
      }
    }

    const products = mergeProducts(catalog, store);
    if (products.length === 0) {
      throw new Error("no products to match: catalog is missing or empty and the store returned nothing");
    }

    const { file: aliasesFile, aliases } = readAliases(flags, host);
    const text = [article.title, article.body].filter(Boolean).join("\n");
    const { wanted, matches } = matchProducts({
      tags,
      products,
      text,
      aliases,
      limit: flags.limit ?? DEFAULT_LIMIT,
    });

    const assets = flags.assets ?? DEFAULT_ASSETS;
    const { copied, reused, errors } = flags["copy-images"]
      ? await copyImages(matches, { assets })
      : { copied: [], reused: [], errors: [] };
    warnings.push(...errors);

    const report = {
      article: flags.article
        ? { file: flags.article, slug: slugOf(flags.article), title: article.title }
        : null,
      tags,
      canonicalTags: wanted,
      registry: registryFile
        ? {
            file: registryFile,
            host: registry?.host ?? null,
            syncedAt: status.syncedAt,
            ageMinutes: status.ageMinutes,
            ttlHours: status.ttlHours,
            fresh: status.fresh,
            recorded,
          }
        : null,
      sources: {
        catalog: catalogFile,
        catalogProducts: catalog.length,
        store: flags.store ?? null,
        storeProducts: store.length,
        aliases: aliasesFile,
      },
      images: { copied: copied.length, reused: reused.length, files: copied },
      matches: matches.map((match) => ({
        ...match,
        caption: match.name,
        figure: match.figure ?? null,
      })),
      warnings,
    };

    if (flags.out) {
      const out = resolve(flags.out);
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`, "utf8");
      console.log(
        `${flags.article ? slugOf(flags.article) : "tags"}: ${matches.length} match(es), ${copied.length} image(s) copied, ${reused.length} reused, report ${flags.out}`,
      );
      for (const match of report.matches) {
        console.log(`${match.score}\t${match.sku || "-"}\t${match.name}\t${match.matched.join("/") || "-"}`);
      }
    } else {
      console.log(JSON.stringify(report, null, 2));
    }

    return matches.length > 0 ? 0 : 1;
  } catch (error) {
    console.error(`error: ${error?.message ?? error}`);
    return 2;
  }
}

if (isEntryPoint(import.meta.url)) {
  run().then((code) => {
    process.exitCode = code;
  });
}
