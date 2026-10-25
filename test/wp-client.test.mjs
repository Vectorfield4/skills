import { afterEach, describe, expect, it, vi } from "vitest";
import { publishArticle, toWpPost, wpEndpoint } from "../lib/wp-client.mjs";

describe("wpEndpoint", () => {
  it("builds the REST path from a site URL", () => {
    expect(wpEndpoint("https://example.com/", "posts")).toBe(
      "https://example.com/wp-json/wp/v2/posts",
    );
  });

  it("accepts a URL that already ends in wp-json", () => {
    expect(wpEndpoint("https://example.com/wp-json", "posts")).toBe(
      "https://example.com/wp-json/wp/v2/posts",
    );
  });
});

describe("toWpPost", () => {
  it("keeps non-empty fields and defaults the status to draft", () => {
    expect(toWpPost({ title: "T", content: "<p>C</p>", excerpt: "", slug: "" })).toEqual({
      title: "T",
      content: "<p>C</p>",
      status: "draft",
    });
  });
});

describe("publishArticle", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts the mapped article with the given auth header", async () => {
    const calls = [];
    vi.stubGlobal("fetch", async (url, init) => {
      calls.push({ url, init });
      return { ok: true, json: async () => ({ id: 7 }) };
    });

    const result = await publishArticle("https://example.com", "Bearer abc", {
      title: "T",
      content: "<p>C</p>",
      status: "publish",
    });

    expect(result).toEqual({ id: 7 });
    expect(calls[0].url).toBe("https://example.com/wp-json/wp/v2/posts");
    expect(calls[0].init.method).toBe("POST");
    expect(calls[0].init.headers.Authorization).toBe("Bearer abc");
    expect(JSON.parse(calls[0].init.body)).toEqual({
      title: "T",
      content: "<p>C</p>",
      status: "publish",
    });
  });
});