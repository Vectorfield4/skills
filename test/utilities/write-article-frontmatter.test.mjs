import { describe, expect, it } from "vitest";

import { field, listField, parseArticle } from "#lib/content/utilities/read-article.mjs";

const LIVE = [
  "---",
  'title: "AGCO and AgiBot agree on a joint pilot"',
  "slug: agco-agibot-pilot",
  'tags: ["AGCO", "AgiBot"]',
  "status: published",
  "source_url: https://news.example.com/agco-deal?utm_source=feed",
  "wp_id: 421",
  "---",
  "",
  "First paragraph.",
  "",
  "Second paragraph.",
].join("\n");

describe("write-article frontmatter via shared reader", () => {
  it("parseArticle on the live fixture", () => {
    const article = parseArticle(LIVE);
    expect(article.title).toBe("AGCO and AgiBot agree on a joint pilot");
    expect(article.slug).toBe("agco-agibot-pilot");
    expect(article.tags).toEqual(["AGCO", "AgiBot"]);
    expect(article.status).toBe("published");
    expect(article.sourceUrl).toBe("https://news.example.com/agco-deal?utm_source=feed");
    expect(article.wpId).toBe(421);
    expect(article.draft).toBe(true);
    expect(article.body).not.toBe("");
    expect(article.frontmatter).not.toBe("");
  });

  it("field and listField on a hand-written frontmatter string", () => {
    const fm = 'title: "A: B"\ntags: ["AGCO", "AgiBot"]';
    expect(field(fm, "title")).toBe("A: B");
    expect(listField(fm, "tags")).toEqual(["AGCO", "AgiBot"]);
    expect(field(fm, "missing")).toBeNull();
    expect(listField(fm, "missing")).toEqual([]);
  });
});