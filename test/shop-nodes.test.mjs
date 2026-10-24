import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { readJson } from "#lib/shop/stable.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const SCRIPTS = join(ROOT, "skills", "content");

function node(script, args, { expectCode = 0 } = {}) {
  try {
    const stdout = execFileSync(process.execPath, [join(SCRIPTS, script), ...args], {
      encoding: "utf8",
      env: { ...process.env, HELLOROBOT_WC_KEY: "", HELLOROBOT_WC_SECRET: "" },
    });
    return { code: 0, stdout };
  } catch (error) {
    if (error.status !== expectCode) {
      throw new Error(`${script} exited ${error.status}\n${error.stdout}\n${error.stderr}`);
    }
    return { code: error.status, stdout: String(error.stdout ?? "") };
  }
}

function workspace() {
  const dir = mkdtempSync(join(tmpdir(), "shop-"));
  return { dir, data: join(dir, "data") };
}

const catalog = {
  currency: "RUB",
  products: [
    {
      sku: "HR-OLD",
      name: "Old Robot",
      slug: "old-robot",
      type: "simple",
      status: "publish",
      stock_status: "onbackorder",
      short_description: "старый товар",
      description: "старый товар",
      categories: ["Гуманоиды"],
      tags: ["гуманоиды"],
      images: [{ src: "https://cdn/old.jpg" }],
      price: "100",
      regular_price: "100",
    },
  ],
};

const gated = {
  items: [
    {
      sku: "HR-NEW1",
      name: "Unitree G1",
      verdict: "publish",
      reasons: [],
      tags: ["гуманоиды", "роботы"],
      categories: ["Гуманоиды"],
      brand: "Unitree",
      image: "https://cdn/g1.jpg",
      url: "https://unitree.com/g1",
      category: "Humanoid robots",
      description: "Человекоподобный робот для лабораторий. Вторая фраза для длины.",
    },
    {
      sku: "HR-NEW2",
      name: "Ghost Vision",
      verdict: "draft",
      reasons: ["no product image"],
      tags: ["оборонная робототехника"],
      categories: [],
      brand: "Ghost Robotics",
      image: "",
      url: "https://ghostrobotics.io/v60",
      category: "Quadruped",
      description: "Четырёхногий робот для инспекции периметра и других задач.",
    },
  ],
};

describe("shop nodes", () => {
  it("merges the gate verdicts into a price-free catalog, twice without changes", { timeout: 30000 }, () => {
    const { dir, data } = workspace();
    mkdirSync(data, { recursive: true });
    const catalogFile = join(dir, "catalog.json");
    const gatedFile = join(data, "gated.json");
    writeFileSync(catalogFile, JSON.stringify(catalog), "utf8");
    writeFileSync(gatedFile, JSON.stringify(gated), "utf8");

    node("shop-catalog/scripts/merge.mjs", ["--catalog", catalogFile, "--gated", gatedFile]);
    const first = readJson(catalogFile);
    expect(first.products.map((product) => product.sku)).toEqual(["HR-NEW1", "HR-NEW2", "HR-OLD"]);
    expect(JSON.stringify(first)).not.toContain('"price"');

    node("shop-catalog/scripts/merge.mjs", ["--catalog", catalogFile, "--gated", gatedFile]);
    expect(JSON.stringify(readJson(catalogFile))).toBe(JSON.stringify(first));

    const check = node(
      "shop-catalog/scripts/merge.mjs",
      ["--catalog", catalogFile, "--gated", gatedFile, "--check"],
      { expectCode: 0 },
    );
    expect(check.code).toBe(0);
  });

  it("gates a plan into publish and draft with reasons", { timeout: 30000 }, () => {
    const { dir } = workspace();
    const plan = join(dir, "plan.json");
    const audit = join(dir, "audit.json");
    const sellers = join(dir, "sellers.yaml");
    const out = join(dir, "gated.json");

    writeFileSync(
      plan,
      JSON.stringify({
        queue: [
          {
            tag: "гуманоиды",
            reason: "gap",
            candidates: [
              {
                sku: "HR-NEW1",
                name: "Unitree G1",
                brand: "Unitree",
                tags: ["гуманоиды"],
                image: "https://cdn/g1.jpg",
                category: "Humanoid",
                description: "Робот для лабораторий, описание достаточной длины для гейта.",
                url: "https://unitree.com/g1",
              },
              {
                sku: "HR-NEW2",
                name: "Unknown Bot",
                brand: "Nobody",
                tags: ["гуманоиды"],
                image: "",
                category: "",
                description: "",
                url: "https://example.com/x",
              },
            ],
          },
        ],
      }),
      "utf8",
    );
    writeFileSync(audit, JSON.stringify({ products: [] }), "utf8");
    writeFileSync(
      sellers,
      'host: h\nupdated_at: "2026-01-01T00:00:00Z"\nitems:\n  - name: Unitree\n    domain: unitree.com\n    kind: brand\n    flagship: ""\n    note: ""\n',
      "utf8",
    );

    node("shop-gate/scripts/gate.mjs", [
      "all",
      "--plan",
      plan,
      "--audit",
      audit,
      "--sellers",
      sellers,
      "--out",
      out,
    ]);
    const result = readJson(out);
    expect(result.stats).toEqual({ total: 2, publish: 1, draft: 1 });
    const draft = result.items.find((item) => item.sku === "HR-NEW2");
    expect(draft.reasons.join(" ")).toContain("brand is not in");
  });

  it("plans gap-closing candidates from an audit and a tagged index", { timeout: 30000 }, () => {
    const { dir } = workspace();
    const audit = join(dir, "audit.json");
    const tagged = join(dir, "tagged-index.json");
    const sellers = join(dir, "sellers.yaml");
    const out = join(dir, "plan.json");

    writeFileSync(
      audit,
      JSON.stringify({
        gaps: ["коботы"],
        known_tag_canons: ["коботы"],
        tags: [{ tag: "коботы", canon: "коботы", articles: 2, covered: false }],
        products: [],
      }),
      "utf8",
    );
    writeFileSync(
      tagged,
      JSON.stringify({
        products: [
          {
            sku: "HR-COBOT",
            name: "UR5e",
            brand: "Universal Robots",
            domain: "universal-robots.com",
            tags: ["коботы"],
            image: "https://cdn/ur5e.jpg",
            category: "Cobot",
            description: "Коллаборативный робот для сборочных операций и других задач.",
            url: "https://universal-robots.com/ur5e",
          },
        ],
        unmapped: [],
      }),
      "utf8",
    );
    writeFileSync(
      sellers,
      'host: h\nupdated_at: "2026-01-01T00:00:00Z"\nitems:\n  - name: Universal Robots\n    domain: universal-robots.com\n    kind: brand\n    flagship: ""\n    note: ""\n',
      "utf8",
    );

    node("shop-plan/scripts/plan.mjs", [
      "--audit",
      audit,
      "--tagged",
      tagged,
      "--sellers",
      sellers,
      "--out",
      out,
    ]);
    const plan = readJson(out);
    expect(plan.queue[0].reason).toBe("gap");
    expect(plan.queue[0].candidates[0].sku).toBe("HR-COBOT");
    expect(plan.candidates).toEqual(["HR-COBOT"]);
  });

  it("writes the alias map from a TypeScript source", { timeout: 30000 }, () => {
    const { dir } = workspace();
    const source = join(dir, "productTags.ts");
    const out = join(dir, "tag-aliases.json");
    writeFileSync(
      source,
      'export const TAG_ALIASES: Record<string, string[]> = {\n  гуманоиды: ["humanoid"],\n};\n',
      "utf8",
    );
    node("product-match/scripts/aliases.mjs", ["--source", source, "--out", out]);
    expect(readJson(out)).toEqual({ гуманоиды: ["humanoid"] });
  });

  it("builds the WordPress MCP plan without tags on product-create", { timeout: 30000 }, () => {
    const { dir } = workspace();
    const catalogFile = join(dir, "catalog.json");
    const gatedFile = join(dir, "gated.json");
    const out = join(dir, "wp-plan.json");
    writeFileSync(catalogFile, JSON.stringify(catalog), "utf8");
    writeFileSync(
      gatedFile,
      JSON.stringify({
        items: [
          {
            sku: "HR-OLD",
            verdict: "publish",
            tags: ["гуманоиды"],
          },
        ],
      }),
      "utf8",
    );

    node("shop-write/scripts/write-wp-payload.mjs", [
      "--catalog",
      catalogFile,
      "--gated",
      gatedFile,
      "--out",
      out,
    ]);
    const plan = readJson(out);
    const [item] = plan.items;
    expect(item.steps).toHaveLength(5);
    expect(item.steps[0].input).not.toHaveProperty("tags");
    expect(item.steps[1].input.taxonomy).toBe("product_tag");
    expect(item.steps[1].input.terms).toEqual(["гуманоиды"]);
    expect(item.steps[4].input.status).toBe("publish");
  });

  it("refuses to write without a gate file", { timeout: 30000 }, () => {
    const { dir } = workspace();
    const catalogFile = join(dir, "catalog.json");
    writeFileSync(catalogFile, JSON.stringify(catalog), "utf8");
    node("shop-write/scripts/write-rest.mjs", ["--catalog", catalogFile], { expectCode: 2 });
  });

  it("audits local article pairs offline and names the gaps", { timeout: 30000 }, () => {
    const { dir } = workspace();
    const articles = join(dir, "articles");
    mkdirSync(articles, { recursive: true });
    writeFileSync(
      join(articles, "a.ru.md"),
      '---\ntitle: "A"\ntags: ["гуманоиды", "коботы"]\n---\n\nТекст.\n',
      "utf8",
    );
    const catalogFile = join(dir, "catalog.json");
    writeFileSync(catalogFile, JSON.stringify(catalog), "utf8");
    const out = join(dir, "audit.json");

    node("shop-audit/scripts/audit.mjs", [
      "--offline",
      "--articles",
      articles,
      "--catalog",
      catalogFile,
      "--out",
      out,
    ]);
    const audit = readJson(out);
    expect(audit.gaps).toEqual(["коботы"]);
    expect(audit.tags.find((row) => row.tag === "гуманоиды")?.covered).toBe(true);
  });
});
