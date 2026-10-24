import { describe, expect, it } from "vitest";

import { readAliasesFile, parseAliasesSource, stripComments } from "#lib/shop/aliases.mjs";
import { auditTags, buildAudit, coverageFor } from "#lib/shop/audit.mjs";
import { catalogEntry, mergeCatalog, stripPriceFields } from "#lib/shop/catalog.mjs";
import { gateProduct, specVerdict, uniqueVerdict } from "#lib/shop/gates.mjs";
import { makeSku, parseSitemap, productFromHtml, productUrls } from "#lib/shop/harvest.mjs";
import { parseListDoc, stringifyListDoc } from "#lib/shop/narrow-yaml.mjs";
import { buildWcPayload, buildWpCreateInput, validatePayload } from "#lib/shop/payload.mjs";
import { buildPlan, plannedCandidates, premiumScores } from "#lib/shop/plan.mjs";
import { normalizeSellers, findSeller } from "#lib/shop/sellers.mjs";
import { hashValue, slugify, stableStringify } from "#lib/shop/stable.mjs";
import { tagIndex } from "#lib/shop/tagmap.mjs";
import { upsertPrices } from "#lib/shop/ledger.mjs";
import { verifyStore } from "#lib/shop/verify.mjs";
import { diffRuns, summarize } from "#lib/shop/report.mjs";
import { reuseNode, recordNode } from "#lib/shop/manifest.mjs";

const ALIASES = { гуманоиды: ["humanoid", "humanoids"], навиг: ["navigation"] };

describe("stable json", () => {
  it("sorts keys and hashes equal values equally", () => {
    expect(stableStringify({ b: 1, a: 2 })).toBe(stableStringify({ a: 2, b: 1 }));
    expect(hashValue({ a: [1, 2] })).toBe(hashValue({ a: [1, 2] }));
    expect(hashValue({ a: 1 })).not.toBe(hashValue({ a: 2 }));
  });

  it("slugifies ru and en names", () => {
    expect(slugify("Unitree G1")).toBe("unitree-g1");
    expect(slugify("Гуманоид  Ёж")).toBe("гуманоид-еж");
  });
});

describe("narrow yaml", () => {
  it("round-trips scalars and list items", () => {
    const doc = {
      scalars: { host: "hello-robot.ru", updated_at: "2026-10-24T09:12:00Z" },
      section: "items",
      items: [{ name: "Unitree", domain: "unitree.com", kind: "brand" }],
    };
    const text = stringifyListDoc(doc, ["host", "updated_at"]);
    const parsed = parseListDoc(text);
    expect(parsed.scalars.host).toBe("hello-robot.ru");
    expect(parsed.items).toEqual([{ name: "Unitree", domain: "unitree.com", kind: "brand" }]);
    expect(stringifyListDoc({ ...parsed }, ["host", "updated_at"])).toBe(text);
  });

  it("refuses unknown indentation with a line number", () => {
    expect(() => parseListDoc("items:\n   - name: x\n")).toThrow(/line 2/);
  });
});

describe("aliases", () => {
  it("parses the TAG_ALIASES literal with comments and quoted keys", () => {
    const source = `
      /** doc */
      export const TAG_ALIASES: Record<string, string[]> = {
        // comment with a colon: here
        гуманоиды: ["humanoid", "humanoids"],
        "складская логистика": ["warehouse", "склад"],
      };
    `;
    expect(parseAliasesSource(source)).toEqual({
      гуманоиды: ["humanoid", "humanoids"],
      "складская логистика": ["warehouse", "склад"],
    });
  });

  it("does not treat a comment as an entry", () => {
    expect(stripComments('a: "// not a comment" // tail')).toContain("// not a comment");
  });
});

describe("harvest", () => {
  const html = `
    <html><head><script type="application/ld+json">
    {"@context":"https://schema.org","@type":"Product","name":"Unitree G1",
     "brand":{"@type":"Brand","name":"Unitree"},"sku":"G1-EU",
     "description":"Humanoid robot for labs.",
     "image":["https://cdn.example/g1.jpg"],
     "category":"Humanoid robots",
     "offers":{"@type":"Offer","price":"19999.00","priceCurrency":"EUR",
       "availability":"https://schema.org/InStock"}}
    </script></head></html>`;

  it("reads the sitemap and keeps one level of an index", () => {
    const index = parseSitemap(
      '<sitemapindex><sitemap><loc>https://x/sitemap-1.xml</loc></sitemap></sitemapindex>',
    );
    expect(index.isIndex).toBe(true);
    expect(index.locs).toEqual(["https://x/sitemap-1.xml"]);
  });

  it("extracts product facts, price included, and keeps them out of payloads", () => {
    const product = productFromHtml(html, { url: "https://unitree.com/g1", domain: "unitree.com" });
    expect(product).toMatchObject({
      sku: "HR-UNITREE-G1",
      name: "Unitree G1",
      brand: "Unitree",
      price: "19999.00",
      currency: "EUR",
      image: "https://cdn.example/g1.jpg",
      availability: "InStock",
    });
    const payload = buildWcPayload(product);
    expect(validatePayload(payload)).toEqual([]);
    expect(payload.regular_price).toBe("0");
    expect(JSON.stringify(payload)).not.toContain("19999");
  });

  it("builds a deterministic sku when the page has none", () => {
    expect(makeSku({ brand: "Unitree", name: "G1" })).toBe("HR-UNITREE-G1");
    expect(makeSku({ brand: "Unitree", name: "Unitree G1" })).toBe("HR-UNITREE-G1");
    expect(makeSku({ sku: "HR-CUSTOM-1", brand: "x", name: "y" })).toBe("HR-CUSTOM-1");
    expect(makeSku({ sku: "00.01.02", brand: "x", name: "y" })).toBe("HR-X-Y");
  });

  it("keeps accessories out of the shop", () => {
    const result = tagIndex({
      products: [
        { sku: "A", name: "Go2 Battery", brand: "Unitree" },
        { sku: "B", name: "Go2", brand: "Unitree", category: "Quadruped" },
      ],
      rules: [{ kind: "brand", match: "Unitree", tags: "роботы" }],
      siteCanons: ["роботы"],
    });
    expect(result.skipped.map((item) => item.sku)).toEqual(["A"]);
    expect(result.products.map((item) => item.sku)).toEqual(["B"]);
  });

  it("skips blog and support urls", () => {
    const urls = productUrls([
      "https://x/products/g1",
      "https://x/blog/post",
      "https://x/support/faq",
    ]);
    expect(urls).toEqual(["https://x/products/g1"]);
  });
});

describe("payload", () => {
  it("never copies a price and keeps is_purchasable true", () => {
    const payload = buildWcPayload(
      { name: "Unitree G1", sku: "HR-1", price: "19999", regular_price: "19999", tags: ["гуманоиды"] },
      {},
    );
    expect(payload.regular_price).toBe("0");
    expect(payload.tags).toEqual([{ name: "гуманоиды" }]);
    expect(payload).not.toHaveProperty("price");
    expect(payload).not.toHaveProperty("sale_price");
  });

  it("never promotes a draft without a gate verdict", () => {
    expect(buildWcPayload({ name: "x", sku: "s" }).status).toBe("draft");
    expect(buildWcPayload({ name: "x", sku: "s", status: "publish" }).status).toBe("publish");
    expect(buildWcPayload({ name: "x", sku: "s" }, { existingStatus: "publish" }).status).toBe("publish");
  });

  it("builds the MCP create input without tags (the ability has no such field)", () => {
    const input = buildWpCreateInput({ name: "x", sku: "s", tags: ["a"] });
    expect(input).not.toHaveProperty("tags");
    expect(input.product_type_alias).toBe("physical");
  });
});

describe("audit", () => {
  const products = [{ sku: "HR-1", name: "Unitree G1", status: "publish", tags: ["Humanoid"] }];

  it("marks a tag without a product as a gap", () => {
    const rows = auditTags({ articleTags: ["humanoid", "гуманоиды", "коботы"], products, aliases: ALIASES });
    expect(rows.map((row) => [row.canon, row.articles, row.covered])).toEqual([
      ["гуманоиды", 2, true],
      ["коботы", 1, false],
    ]);
  });

  it("builds the audit document and keeps tag canons", () => {
    const audit = buildAudit({
      posts: [{ slug: "a", tags: [1, 2] }],
      termNames: new Map([[1, "Humanoid"], [2, "коботы"]]),
      products,
      aliases: ALIASES,
      host: "hello-robot.ru",
    });
    expect(audit.articles).toBe(1);
    expect(audit.gaps).toEqual(["коботы"]);
    expect(audit.known_tag_canons).toEqual(["гуманоиды", "коботы"]);
  });

  it("re-checks coverage for the verify node", () => {
    const coverage = coverageFor(["humanoid", "коботы"], products, ALIASES);
    expect(coverage.covered).toBe(true);
    expect(coverage.uncovered).toEqual(["коботы"]);
  });
});

describe("tagmap", () => {
  const rules = [
    { kind: "brand", match: "Unitree", tags: "роботы, гуманоиды" },
    { kind: "type", match: "humanoid", tags: "гуманоиды, неробот" },
    { kind: "model", match: "go2", tags: "навигация" },
  ];
  const siteCanons = ["роботы", "гуманоиды", "навигация"];

  it("unions brand and type rules and drops tags the blog does not use", () => {
    const result = tagIndex({
      products: [{ sku: "A", name: "Unitree G1", brand: "Unitree", category: "Humanoid" }],
      rules,
      siteCanons,
      aliases: ALIASES,
    });
    expect(result.products[0].tags).toEqual(["гуманоиды", "роботы"]);
    expect(result.products[0].dropped).toEqual(["неробот"]);
  });

  it("lets a model rule win outright", () => {
    const result = tagIndex({
      products: [{ sku: "B", name: "Unitree Go2", brand: "Unitree" }],
      rules,
      siteCanons,
    });
    expect(result.products[0].tags).toEqual(["навигация"]);
  });

  it("reports a model with no rule as unmapped instead of guessing", () => {
    const result = tagIndex({
      products: [{ sku: "C", name: "Some AMR 900", brand: "Unknown" }],
      rules,
      siteCanons,
    });
    expect(result.products).toEqual([]);
    expect(result.unmapped).toEqual([{ sku: "C", name: "Some AMR 900", brand: "Unknown" }]);
  });

  it("skips a page that is not a robot at all", () => {
    const result = tagIndex({
      products: [{ sku: "D", name: "Pages Archive", brand: "Unknown" }],
      rules,
      siteCanons,
    });
    expect(result.skipped).toEqual([{ sku: "D", name: "Pages Archive", reason: "no robot type" }]);
  });
});

describe("plan", () => {
  const sellers = [{ name: "Unitree", domain: "unitree.com", kind: "brand" }];
  const audit = {
    gaps: ["гуманоиды"],
    known_tag_canons: ["гуманоиды", "навигация"],
    tags: [
      { tag: "гуманоиды", canon: "гуманоиды", articles: 3, covered: false },
      { tag: "навигация", canon: "навигация", articles: 2, covered: true },
    ],
    products: [{ sku: "HR-OLD", name: "Old" }],
  };
  const tagged = {
    products: [
      { sku: "NEW-1", name: "Unitree G1", brand: "Unitree", tags: ["гуманоиды"], image: "i", description: "d".repeat(120), price: "20000" },
      { sku: "NEW-2", name: "Unitree X2", brand: "Other", tags: ["гуманоиды"], image: "", description: "", price: "1" },
      { sku: "HR-OLD", name: "Old", brand: "Unitree", tags: ["гуманоиды"], image: "i" },
      { sku: "NEW-3", name: "Unitree Go2", brand: "Unitree", tags: ["навигация"], image: "i", description: "d".repeat(120), price: "30000" },
    ],
    unmapped: [],
  };

  it("ranks a trusted, illustrated, described product first", () => {
    const plan = buildPlan({ audit, tagged, sellers, limitPerTag: 3 });
    const gap = plan.queue.find((row) => row.reason === "gap");
    expect(gap.tag).toBe("гуманоиды");
    expect(gap.candidates[0].sku).toBe("NEW-1");
    expect(gap.candidates.some((item) => item.sku === "HR-OLD")).toBe(false);
  });

  it("adds the premium queue for a covered tag", () => {
    const plan = buildPlan({ audit, tagged, sellers });
    const premium = plan.queue.find((row) => row.reason === "premium");
    expect(premium?.tag).toBe("навигация");
    expect(premium?.candidates[0].sku).toBe("NEW-3");
  });

  it("scores premium by price percentile inside the brand", () => {
    const scores = premiumScores([
      { sku: "a", brand: "B", price: "1" },
      { sku: "b", brand: "B", price: "2" },
      { sku: "c", brand: "B", price: "3" },
      { sku: "d", brand: "B", price: "4" },
    ]);
    expect(scores.get("d")).toBe(2);
    expect(scores.get("a")).toBe(0);
  });

  it("deduplicates planned candidates by sku", () => {
    const plan = buildPlan({ audit, tagged, sellers });
    const candidates = plannedCandidates(plan);
    expect(new Set(candidates.map((item) => item.sku)).size).toBe(candidates.length);
  });
});

describe("gates", () => {
  it("rejects a duplicate name or brand+model, but not the product itself", () => {
    const existing = [{ sku: "HR-1", name: "Unitree G1" }];
    // The same sku is an enrichment of that entry, not a duplicate.
    expect(uniqueVerdict({ sku: "hr-1", name: "Unitree G1" }, existing).ok).toBe(true);
    expect(uniqueVerdict({ sku: "X", name: "unitree  g1" }, existing).ok).toBe(false);
    expect(uniqueVerdict({ sku: "X", name: "Unitree G1 Pro" }, existing).ok).toBe(false);
    expect(uniqueVerdict({ sku: "X", name: "Boston Spot" }, existing).ok).toBe(true);
  });

  it("requires an image and a fact to render", () => {
    expect(specVerdict({ name: "x", image: "", description: "d".repeat(80) }).ok).toBe(false);
    expect(specVerdict({ name: "x", image: "i", description: "" }).ok).toBe(false);
    expect(specVerdict({ name: "x", image: "i", category: "Гуманоиды" }).ok).toBe(true);
  });

  it("publishes only when all three verdicts pass", () => {
    const sellers = [{ name: "Unitree", domain: "unitree.com" }];
    const product = {
      sku: "N1",
      name: "Unitree G1",
      brand: "Unitree",
      tags: ["гуманоиды"],
      image: "i",
      category: "Гуманоиды",
    };
    expect(gateProduct(product, { sellers, existing: [] }).verdict).toBe("publish");
    expect(gateProduct(product, { sellers, existing: [{ sku: "N2", name: "Unitree G1" }] }).verdict).toBe(
      "draft",
    );
    expect(gateProduct(product, { sellers, existing: [{ sku: "N1", name: "Unitree G1" }] }).verdict).toBe(
      "publish",
    );
    expect(gateProduct({ ...product, image: "" }, { sellers }).verdict).toBe("draft");
    expect(gateProduct(product, { sellers: [{ name: "Other", domain: "o.com" }] }).verdict).toBe("draft");
  });
});

describe("catalog", () => {
  const item = {
    sku: "HR-UNITREE-G1",
    name: "Unitree G1",
    verdict: "publish",
    tags: ["гуманоиды", "роботы", "гуманоиды"],
    categories: [],
    image: "https://cdn/g1.jpg",
    description: "Человекоподобный робот. Вторая фраза.",
    url: "https://unitree.com/g1",
  };

  it("strips price fields from an old catalog", () => {
    expect(stripPriceFields({ sku: "a", price: "1", regular_price: "1", name: "n" })).toEqual({
      sku: "a",
      name: "n",
    });
  });

  it("builds a price-free entry sorted and deduplicated", () => {
    const entry = catalogEntry(item);
    expect(entry).not.toHaveProperty("price");
    expect(entry.status).toBe("publish");
    expect(entry.tags).toEqual(["гуманоиды", "роботы"]);
    expect(entry.slug).toBe("unitree-g1");
    expect(entry.review_note).toBe("");
  });

  it("is idempotent: the same merge twice changes nothing", () => {
    const first = mergeCatalog({ catalog: [], items: [item] });
    const second = mergeCatalog({ catalog: first.catalog.products, items: [item] });
    expect(JSON.stringify(second.catalog)).toBe(JSON.stringify(first.catalog));
    expect(second.stats.untouched).toEqual(["HR-UNITREE-G1"]);
  });

  it("keeps a draft with the gate reasons as a note", () => {
    const entry = catalogEntry({ ...item, verdict: "draft", reasons: ["no product image"] });
    expect(entry.status).toBe("draft");
    expect(entry.review_note).toContain("no product image");
  });
});

describe("sellers and ledger", () => {
  it("normalizes and finds a seller by brand or domain", () => {
    const items = normalizeSellers([
      { name: "Unitree", domain: "https://www.unitree.com/x", kind: "brand", flagship: "G1, H2" },
      { name: "Unitree", domain: "unitree.com" },
      { name: "No domain" },
    ]);
    expect(items).toHaveLength(1);
    expect(findSeller(items, { brand: "unitree" })?.name).toBe("Unitree");
    expect(findSeller(items, { domain: "www.unitree.com" })?.name).toBe("Unitree");
  });

  it("upserts ledger prices by sku and keeps empty prices empty", () => {
    const first = upsertPrices({ doc: null, items: [{ sku: "A", name: "G1", price: "19 999,00", brand: "Unitree" }] });
    expect(first.doc.items[0].price).toBe("19999.00");
    const second = upsertPrices({ doc: first.doc, items: [{ sku: "A", name: "G1", price: "" }] });
    expect(second.doc.items).toHaveLength(1);
    expect(second.doc.items[0].price).toBe("");
    expect(second.withPrice).toBe(0);
  });
});

describe("manifest and report", () => {
  it("reuses a node only when inputs and status match", () => {
    const manifest = { nodes: {} };
    recordNode(manifest, "audit", { inputs: { a: 1 }, outputs: { rows: 2 } });
    expect(reuseNode(manifest, "audit", { a: 1 }).reuse).toBe(true);
    expect(reuseNode(manifest, "audit", { a: 2 }).reuse).toBe(false);
    recordNode(manifest, "audit", { inputs: { a: 1 }, status: "failed" });
    expect(reuseNode(manifest, "audit", { a: 1 }).reuse).toBe(false);
  });

  it("summarizes and diffs runs", () => {
    const manifest = { host: "h", tree: ["audit"], nodes: { audit: { status: "ok", ms: 5, requests: 2 } } };
    expect(summarize(manifest)).toMatchObject({ nodes: 1, executed: 1, requests: 2 });
    const before = { nodes: { audit: { outputs: "x" } } };
    expect(diffRuns(before, manifest).changed).toEqual(["audit"]);
    expect(diffRuns(before, { nodes: { audit: { outputs: "x" } } }).same).toEqual(["audit"]);
  });
});

describe("verify", () => {
  it("fails a draft product and a product without tags", () => {
    const expected = [
      { sku: "A", tags: ["гуманоиды"] },
      { sku: "B", tags: ["коботы"] },
    ];
    const products = [{ sku: "A", tags: [{ name: "Humanoid" }], images: [1] }];
    const result = verifyStore({ expected, products, aliases: ALIASES });
    expect(result.rows.find((row) => row.sku === "A")?.ok).toBe(true);
    expect(result.rows.find((row) => row.sku === "B")?.ok).toBe(false);
    expect(result.ok).toBe(false);
  });
});
