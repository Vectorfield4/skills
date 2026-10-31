import { describe, expect, it } from "vitest";

import { parseArticle, slugify } from "#lib/content/utilities/read-article.mjs";
import { sync } from "../../skills/content/wp-sync-tags/scripts/sync.mjs";

describe("wp frontmatter", () => {
  it("reads tags and wp_id from frontmatter", () => {
    const text = ["---", 'tags: ["a","b"]', "wp_id: 7", "---", "", "Body."].join("\n");
    const article = parseArticle(text);
    expect(article.tags).toEqual(["a", "b"]);
    expect(article.wpId).toBe(7);
  });

  it("produces a slugify-style tag slug", () => {
    expect(slugify("Hello World")).toBe("hello-world");
  });

  it("keeps the sync export", () => {
    expect(typeof sync).toBe("function");
  });
});
