import { describe, expect, it } from "vitest";
import {
  attachSourceMeta,
  filterByTopic,
  normalizeSources,
  recencyFactor,
  topicKeywords,
} from "../lib/article-search.mjs";

describe("topicKeywords", () => {
  it("keeps words of two or more characters and drops stop words", () => {
    expect(topicKeywords("AI robotics in warehouses")).toEqual(["ai", "robotics", "warehouses"]);
  });
});

describe("filterByTopic", () => {
  it("matches title or body", () => {
    const items = [
      { title: "Warehouse robots", body: "" },
      { title: "Finance", body: "Robots spending" },
      { title: "Gardening", body: "" },
    ];
    expect(filterByTopic(items, "robots")).toHaveLength(2);
  });

  it("returns every item when the topic has no keywords", () => {
    expect(filterByTopic([{ title: "a" }], "")).toHaveLength(1);
  });
});

describe("topicKeywords unicode", () => {
  it("handles Cyrillic keywords", () => {
    expect(topicKeywords("Роботы на складе")).toContain("роботы");
    expect(topicKeywords("Роботы на складе")).toContain("складе");
  });
});

describe("normalizeSources", () => {
  it("keeps lang, country, weight with defaults", () => {
    const result = normalizeSources([{ name: "a", url: "https://e.com/feed", lang: "ru", country: "RU", weight: 2.5 }]);
    expect(result[0]).toMatchObject({ lang: "ru", country: "RU", weight: 2.5 });
    const def = normalizeSources([{ name: "b", url: "https://e.com/x" }]);
    expect(def[0]).toMatchObject({ lang: null, country: null, weight: 1.0 });
  });
});

describe("recencyFactor", () => {
  it("returns 1.0 for recent dates", () => {
    const recent = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    expect(recencyFactor(recent)).toBe(1.0);
  });
  it("returns 0.7 for dates within 30 days", () => {
    const d = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000);
    expect(recencyFactor(d)).toBe(0.7);
  });
  it("returns 0.4 for older dates", () => {
    const d = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    expect(recencyFactor(d)).toBe(0.4);
  });
  it("returns 0.5 for missing or invalid dates", () => {
    expect(recencyFactor(null)).toBe(0.5);
    expect(recencyFactor("not-a-date")).toBe(0.5);
  });
});

describe("attachSourceMeta", () => {
  it("copies missing fields from source", () => {
    const source = { lang: "ru", country: "RU", weight: 2.0 };
    const items = [{ title: "t" }, { title: "u", lang: "en" }];
    const out = attachSourceMeta(items, source);
    expect(out[0]).toMatchObject({ lang: "ru", country: "RU", weight: 2.0 });
    expect(out[1].lang).toBe("en");
  });
});