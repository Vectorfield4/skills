import { describe, expect, it } from "vitest";
import {
  canonicalizeUrl,
  decodeXmlEntities,
  dedup,
  normalizeSources,
  parseAtom,
  parseHackerNews,
  parseRSS,
} from "../skills/data/news-fetcher/scripts/feeds.mjs";

describe("decodeXmlEntities", () => {
  it("decodes named entities", () => {
    expect(decodeXmlEntities("AT&amp;T")).toBe("AT&T");
  });
  it("decodes numeric entities", () => {
    expect(decodeXmlEntities("it&#8217;s")).toBe("it\u2019s");
    expect(decodeXmlEntities("it&#x2019;s")).toBe("it\u2019s");
  });
  it("leaves unknown entities alone", () => {
    expect(decodeXmlEntities("&unknownentity;")).toBe("&unknownentity;");
  });
});

describe("canonicalizeUrl", () => {
  it("strips tracking params and normalizes", () => {
    expect(canonicalizeUrl("http://example.com/a/?utm_source=x&foo=1#frag")).toBe(
      "https://example.com/a?foo=1",
    );
  });
  it("handles invalid input gracefully", () => {
    expect(canonicalizeUrl("not-a-url")).toBe("not-a-url");
  });
});

describe("parseRSS", () => {
  it("extracts items with CDATA titles", () => {
    const xml = `<rss><channel><item><title><![CDATA[Hello]]></title><link>http://e.com/x?utm_source=1</link><pubDate>Mon, 01 Jan 2024</pubDate></item></channel></rss>`;
    const items = parseRSS(xml, "src");
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("Hello");
    expect(items[0].url).toBe("https://e.com/x");
    expect(items[0].date).toBe("Mon, 01 Jan 2024");
  });
  it("decodes entities in titles and falls back to guid", () => {
    const xml = `<rss><channel><item><title>Robots &amp; jobs</title><guid>https://e.com/y</guid></item></channel></rss>`;
    const items = parseRSS(xml, "src");
    expect(items[0].title).toBe("Robots & jobs");
    expect(items[0].url).toBe("https://e.com/y");
  });
});

describe("parseAtom", () => {
  it("reads the href attribute and updated date", () => {
    const xml = `<feed><entry><title>Hi</title><link rel="alternate" href="http://e.com/z"/><updated>2024-01-01T00:00:00Z</updated></entry></feed>`;
    const items = parseAtom(xml, "src");
    expect(items[0]).toMatchObject({
      title: "Hi",
      url: "https://e.com/z",
      date: "2024-01-01T00:00:00Z",
    });
  });
});

describe("parseHackerNews", () => {
  it("falls back to the discussion page when a story has no url", () => {
    const json = { hits: [{ objectID: "42", title: "Thread", created_at: "2024-01-01" }] };
    expect(parseHackerNews(json, "hn")[0].url).toBe("https://news.ycombinator.com/item?id=42");
  });
});

describe("dedup", () => {
  it("removes duplicates by canonical url", () => {
    const items = [
      { source: "a", title: "t", url: "http://e.com/x?utm_source=1", date: null },
      { source: "b", title: "t2", url: "https://e.com/x", date: null },
    ];
    expect(dedup(items)).toHaveLength(1);
  });
});

describe("normalizeSources", () => {
  it("accepts a bare array and defaults the type to rss", () => {
    expect(normalizeSources([{ name: "a", url: "https://e.com/feed" }])).toEqual([
      { name: "a", url: "https://e.com/feed", type: "rss" },
    ]);
  });
  it("accepts a { sources } wrapper", () => {
    expect(
      normalizeSources({ sources: [{ name: "a", url: "https://e.com/feed", type: "atom" }] }),
    ).toHaveLength(1);
  });
  it("rejects an unsupported type", () => {
    expect(() => normalizeSources([{ name: "a", url: "https://e.com", type: "html" }])).toThrow(
      /unsupported type/,
    );
  });
});
