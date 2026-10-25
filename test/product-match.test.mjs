import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  assetUrl,
  buildAliasIndex,
  canonicalTag,
  figureHtml,
  formatAge,
  imageFileName,
  matchProducts,
  mergeProducts,
  mergeWpTags,
  normalizeTag,
  parseRegistry,
  readArticle,
  readRegistry,
  readWpTags,
  recordTags,
  registryStatus,
  stringifyRegistry,
  writeRegistry,
} from "../lib/product-match.mjs";

const NOW = new Date("2026-10-24T12:00:00.000Z");

describe("tags", () => {
  it("normalizes case, ё and punctuation", () => {
    expect(normalizeTag("  Промышленная,  РОБОТОТЕХНИКА! ")).toBe("промышленная робототехника");
    expect(normalizeTag("Ёж")).toBe("еж");
    expect(normalizeTag(null)).toBe("");
  });

  it("folds aliases in both directions", () => {
    const index = buildAliasIndex({ гуманоиды: ["humanoid", "humanoid robots"] });
    expect(canonicalTag("Humanoid Robots", index)).toBe("гуманоиды");
    expect(canonicalTag("гуманоиды", index)).toBe("гуманоиды");
    expect(canonicalTag("коботы", index)).toBe("коботы");
  });
});

describe("registry codec", () => {
  const registry = {
    host: "hello-robot.ru",
    syncedAt: "2026-10-24T09:12:00.000Z",
    ttlHours: 4,
    tags: {
      "Boston Dynamics": { count: 1, latestUpdate: "2026-10-24T09:12:00.000Z", id: 42, wp_posts: 7 },
      гуманоиды: { count: 3, latestUpdate: "2026-10-23T18:00:00.000Z" },
      "AI: robotics": { count: 0, latestUpdate: null },
    },
  };

  it("round-trips through text, quoting keys and timestamps", () => {
    const text = stringifyRegistry(registry);
    expect(text).toContain('"Boston Dynamics":');
    expect(text).toContain('"AI: robotics":');
    expect(text).toContain('latestUpdate: "2026-10-24T09:12:00.000Z"');
    expect(parseRegistry(text)).toEqual(registry);
  });

  it("sorts tag keys so the same registry always renders the same file", () => {
    const reversed = {
      ...registry,
      tags: Object.fromEntries(Object.entries(registry.tags).reverse()),
    };
    expect(stringifyRegistry(reversed)).toBe(stringifyRegistry(registry));
  });

  it("treats a missing synced_at as never synced", () => {
    const text = stringifyRegistry({ ...registry, syncedAt: null });
    expect(parseRegistry(text).syncedAt).toBeNull();
  });

  it("rejects anything outside the schema with a line number", () => {
    expect(() => parseRegistry("host: x\nwat: y\n")).toThrow(/line 2/);
    expect(() => parseRegistry("host: x\ntags:\n  a: b\n")).toThrow(/must be a block/);
    expect(() => parseRegistry("host: x\ntags:\n  a:\n    nope: 1\n")).toThrow(/unknown tag field/);
    expect(() => parseRegistry("host: x\ntags:\n  a:\n    count: много\n")).toThrow(/must be a number/);
    expect(() => parseRegistry("host: x\ntags:\n\t a:\n")).toThrow(/tabs/);
  });

  it("reads and writes a file, and returns null for a missing one", () => {
    let dir;
    try {
      dir = mkdtempSync(join(tmpdir(), "tags-"));
      const file = join(dir, "data/hello-robot.ru/tags.yaml");
      expect(readRegistry(file)).toBeNull();
      writeRegistry(file, registry);
      expect(readRegistry(file)).toEqual(registry);
    } finally {
      if (dir) rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("freshness", () => {
  const registry = { syncedAt: "2026-10-24T09:12:00.000Z", ttlHours: 4, tags: {} };

  it("is fresh just under the ttl and stale past it", () => {
    expect(registryStatus(registry, { now: new Date("2026-10-24T12:59:00.000Z") }).fresh).toBe(true);
    expect(registryStatus(registry, { now: new Date("2026-10-24T13:13:00.000Z") })).toMatchObject({
      fresh: false,
      reason: "stale",
      ageMinutes: 241,
    });
  });

  it("treats a future date as fresh and a missing one as never synced", () => {
    expect(registryStatus(registry, { now: new Date("2026-10-24T08:00:00.000Z") }).fresh).toBe(true);
    expect(registryStatus({ tags: {} }, { now: NOW })).toMatchObject({
      fresh: false,
      reason: "never-synced",
    });
    expect(registryStatus({ ...registry, syncedAt: "nope" }, { now: NOW }).reason).toBe("bad-date");
  });

  it("formats an age for humans", () => {
    expect(formatAge(45)).toBe("45m");
    expect(formatAge(180)).toBe("3h");
    expect(formatAge(190)).toBe("3h 10m");
    expect(formatAge(null)).toBe("never");
  });
});

describe("registry updates", () => {
  it("merges a WordPress dump without touching local counters", () => {
    const registry = {
      host: "hello-robot.ru",
      syncedAt: "2026-10-20T00:00:00.000Z",
      ttlHours: 4,
      tags: { гуманоиды: { count: 5, latestUpdate: "2026-10-21T00:00:00.000Z" } },
    };
    const merged = mergeWpTags(
      registry,
      [
        { id: 1, name: "гуманоиды", count: 12 },
        { id: 2, name: "Boston Dynamics", count: 3 },
      ],
      { now: NOW },
    );

    expect(merged.tags["гуманоиды"]).toEqual({
      count: 5,
      latestUpdate: "2026-10-21T00:00:00.000Z",
      id: 1,
      wp_posts: 12,
    });
    expect(merged.tags["Boston Dynamics"]).toMatchObject({ count: 0, wp_posts: 3 });
    expect(merged.tags["Boston Dynamics"].latestUpdate).toBeNull();
    expect(merged.syncedAt).toBe(NOW.toISOString());
  });

  it("counts a recorded tag and creates an unknown one", () => {
    const { registry, recorded } = recordTags(
      { host: "h", syncedAt: null, ttlHours: 4, tags: { гуманоиды: { count: 1, latestUpdate: null } } },
      ["гуманоиды", "коботы", ""],
      { now: NOW },
    );

    expect(registry.tags["гуманоиды"].count).toBe(2);
    expect(registry.tags["гуманоиды"].latestUpdate).toBe(NOW.toISOString());
    expect(registry.tags["коботы"]).toEqual({ count: 1, latestUpdate: NOW.toISOString() });
    expect(recorded).toEqual([
      { name: "гуманоиды", count: 2 },
      { name: "коботы", count: 1 },
    ]);
  });
});

describe("product matching", () => {
  const products = [
    {
      sku: "HR-UNITREE-G1",
      name: "Unitree G1",
      tags: ["гуманоиды", "манипуляторы"],
      images: ["https://shop/g1.png"],
      status: "publish",
      source: "catalog",
    },
    {
      sku: "HR-UR7",
      name: "Universal Robots UR7",
      tags: ["коботы"],
      images: [],
      status: "publish",
      source: "catalog",
    },
    {
      sku: "HR-SPOT",
      name: "Boston Dynamics Spot",
      tags: ["роботы"],
      images: ["https://shop/spot.jpg"],
      status: "draft",
      source: "catalog",
    },
  ];

  it("ranks tag overlap, then a model mentioned in the text", () => {
    const { matches } = matchProducts({
      tags: ["гуманоиды"],
      products,
      text: "Boston Dynamics Spot умеет ходить по лестницам",
    });

    expect(matches.map((match) => match.sku)).toEqual(["HR-SPOT", "HR-UNITREE-G1"]);
    expect(matches[0]).toMatchObject({ score: 3, nameHit: true, matched: [] });
    expect(matches[1]).toMatchObject({ score: 2, matched: ["гуманоиды"] });
  });

  it("folds aliases so an English tag finds a Russian product", () => {
    const { wanted, matches } = matchProducts({
      tags: ["humanoid robots"],
      products,
      aliases: { гуманоиды: ["humanoid", "humanoid robots"] },
    });

    expect(wanted).toEqual(["гуманоиды"]);
    expect(matches.map((match) => match.sku)).toEqual(["HR-UNITREE-G1"]);
  });

  it("returns nothing for an unrelated tag and respects the limit", () => {
    expect(matchProducts({ tags: ["навигация"], products }).matches).toEqual([]);
    expect(matchProducts({ tags: ["гуманоиды", "коботы"], products, limit: 1 }).matches).toHaveLength(1);
  });

  it("merges the live store over the catalog and keeps both tag sets", () => {
    const merged = mergeProducts(
      [{ sku: "A", name: "A", tags: ["гуманоиды"], images: ["https://cat/a.jpg"] }],
      [{ sku: "A", name: "A live", tags: ["коботы"], images: ["https://store/a.png"], status: "publish" }],
    );

    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      name: "A live",
      tags: ["гуманоиды", "коботы"],
      images: ["https://store/a.png"],
      source: "catalog+store",
    });
  });
});

describe("figures and paths", () => {
  it("builds a figure whose caption is the model name", () => {
    expect(figureHtml({ caption: "Unitree G1", url: "/images/products/hr-unitree-g1.jpg" })).toBe(
      [
        "<figure>",
        '  <img src="/images/products/hr-unitree-g1.jpg" alt="Unitree G1" loading="lazy" />',
        "  <figcaption>Unitree G1</figcaption>",
        "</figure>",
      ].join("\n"),
    );
  });

  it("escapes a caption instead of injecting HTML", () => {
    expect(figureHtml({ caption: 'A "B" <C>', url: "/x.png" })).toContain("A &quot;B&quot; &lt;C&gt;");
  });

  it("derives a file name from sku and the image extension", () => {
    expect(imageFileName("HR-UNITREE-G1", "Unitree G1", "https://shop/g1.PNG?x=1")).toBe(
      "hr-unitree-g1.png",
    );
    expect(imageFileName("", "Boston Dynamics Spot", "https://shop/spot.jpeg")).toBe(
      "boston-dynamics-spot.jpg",
    );
  });

  it("turns an assets dir into a public URL", () => {
    expect(assetUrl("public/images/products", "a.jpg")).toBe("/images/products/a.jpg");
    expect(assetUrl("images/products/", "a.jpg")).toBe("/images/products/a.jpg");
    expect(assetUrl("./public/images/products", "a.jpg")).toBe("/images/products/a.jpg");
  });
});

describe("inputs", () => {
  it("reads inline and block tag lists from article frontmatter", () => {
    const inline = readArticle('---\ntitle: "A"\ntags: [гуманоиды, "Boston Dynamics"]\n---\n\nText');
    expect(inline).toEqual({ title: "A", tags: ["гуманоиды", "Boston Dynamics"], body: "\nText" });

    const block = readArticle("---\ntitle: B\ntags:\n  - коботы\n  - навигация\n---\nBody");
    expect(block.tags).toEqual(["коботы", "навигация"]);
    expect(block.body).toBe("Body");
    expect(readArticle("no frontmatter").tags).toEqual([]);
  });

  it("accepts an MCP envelope or a plain array of tags", () => {
    let dir;
    try {
      dir = mkdtempSync(join(tmpdir(), "wp-tags-"));
      const file = join(dir, "tags.json");
      writeFileSync(file, JSON.stringify({ success: true, data: [{ id: 1, name: "a" }] }), "utf8");
      expect(readWpTags(file)).toEqual([{ id: 1, name: "a" }]);
      writeFileSync(file, JSON.stringify([{ id: 2, name: "b" }]), "utf8");
      expect(readWpTags(file)).toEqual([{ id: 2, name: "b" }]);
      writeFileSync(file, JSON.stringify({ nada: true }), "utf8");
      expect(() => readWpTags(file)).toThrow(/expected an array/);
    } finally {
      if (dir) rmSync(dir, { recursive: true, force: true });
    }
  });
});
