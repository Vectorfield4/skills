import { describe, expect, it } from "vitest";

import { parseArticle } from "#lib/content/utilities/read-article.mjs";
import { parseRegistry, readArticle, stringifyRegistry } from "#lib/product-match.mjs";

const LIVE = [
  "---",
  'title: "AGCO and AgiBot agree on a joint pilot"',
  "tags: [\"AGCO\", \"AgiBot\"]",
  "---",
  "",
  "First paragraph.",
  "",
  "Second paragraph.",
].join("\n");

describe("product-match readArticle delegates to parseArticle", () => {
  it("returns title and tags matching parseArticle on the live fixture", () => {
    const article = parseArticle(LIVE);
    const matched = readArticle(LIVE);
    expect(matched.title).toBe(article.title);
    expect(matched.tags).toEqual(article.tags);
    // The two readers intentionally differ in body trimming: readArticle keeps
    // the leading newline (backward compat), parseArticle trims it.
    expect(matched.body.trim()).toBe(article.body.trim());
  });

  it("agrees on tags for a block list", () => {
    const text = ["---", "title: Block tags", "tags:", "  - AGCO", "  - AgiBot", "---", "", "Body."].join("\n");
    expect(readArticle(text).tags).toEqual(parseArticle(text).tags);
  });

  it("agrees on tags for a comma string", () => {
    const text = ["---", 'tags: "AGCO, AgiBot"', "---", "", "Body."].join("\n");
    expect(readArticle(text).tags).toEqual(parseArticle(text).tags);
  });
});

describe("product-match registry codec untouched", () => {
  it("round-trips through text", () => {
    const registry = {
      host: "hello-robot.ru",
      syncedAt: "2026-10-24T09:12:00.000Z",
      ttlHours: 4,
      tags: { гуманоиды: { count: 3, latestUpdate: "2026-10-23T18:00:00.000Z" } },
    };
    expect(parseRegistry(stringifyRegistry(registry))).toEqual(registry);
  });
});