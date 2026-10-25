import { describe, expect, it } from "vitest";
import {
  attachSourceMeta,
  filterByTopic,
  normalizeSources,
  parseHtmlList,
  parseJsonList,
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

  it("accepts html-list with a selector and baseUrl", () => {
    const [source] = normalizeSources([
      {
        name: "Figure",
        url: "https://www.figure.ai/news",
        type: "html-list",
        selector: 'a[href*="/news/"]',
        baseUrl: "https://www.figure.ai/news",
        lang: "en",
      },
    ]);
    expect(source).toMatchObject({
      type: "html-list",
      selector: 'a[href*="/news/"]',
      baseUrl: "https://www.figure.ai/news",
      lang: "en",
    });
  });

  it("defaults html-list selector and baseUrl to null", () => {
    const [source] = normalizeSources([
      { name: "Unitree", url: "https://www.unitree.com/news/", type: "html-list" },
    ]);
    expect(source).toMatchObject({ selector: null, baseUrl: null });
  });

  it("keeps selector and baseUrl off feed sources", () => {
    const [source] = normalizeSources([
      { name: "a", url: "https://e.com/feed", selector: "a", baseUrl: "https://e.com" },
    ]);
    expect("selector" in source).toBe(false);
    expect("baseUrl" in source).toBe(false);
  });

  it("rejects a relative html-list url", () => {
    expect(() => normalizeSources([{ name: "a", url: "/news", type: "html-list" }])).toThrow(
      /absolute url/,
    );
  });

  it("rejects an html-list source with a broken baseUrl", () => {
    expect(() =>
      normalizeSources([
        { name: "a", url: "https://e.com/news", type: "html-list", baseUrl: "not-a-url" },
      ]),
    ).toThrow(/invalid baseUrl/);
  });

  it("rejects an unusable selector", () => {
    expect(() =>
      normalizeSources([{ name: "a", url: "https://e.com/news", type: "html-list", selector: ">>>" }]),
    ).toThrow(/unusable selector/);
  });
});

const NEWSROOM_HTML = `
<div class="news-list">
  <a href="/news/robot-launch"><h3>Robot launch &amp; more</h3><time datetime="2026-08-05">Aug 5</time></a>
  <a href="/news/robot-launch?utm_source=feed">Duplicate entry</a>
  <a href="/news/humanoid-pilot"><img alt="Humanoid pilot at a plant" src="/p.png"></a>
  <a href="/about">About us</a>
  <a href="mailto:press@example.com">Press contact</a>
  <a href="#top">Back to top</a>
</div>
<div class="promo"><a href="/news/promo-teaser">Promo teaser</a></div>
`;

describe("parseHtmlList", () => {
  const source = {
    name: "Example",
    url: "https://e.com/press",
    type: "html-list",
    selector: '.news-list a[href*="/news/"]',
    baseUrl: "https://e.com/news",
  };

  it("keeps only selector matches inside baseUrl, with titles and dates", () => {
    const items = parseHtmlList(NEWSROOM_HTML, source);
    expect(items).toEqual([
      {
        source: "Example",
        title: "Robot launch & more",
        url: "https://e.com/news/robot-launch",
        date: "2026-08-05T00:00:00.000Z",
      },
      {
        source: "Example",
        title: "Humanoid pilot at a plant",
        url: "https://e.com/news/humanoid-pilot",
        date: null,
      },
    ]);
  });

  it("drops duplicates that differ only by tracking params", () => {
    const items = parseHtmlList(NEWSROOM_HTML, source);
    expect(items.filter((item) => item.url.includes("robot-launch"))).toHaveLength(1);
  });

  it("supports a child combinator", () => {
    const html = `<div class="news-list"><a href="/news/direct">Direct</a><span><a href="/news/nested">Nested</a></span></div>`;
    const items = parseHtmlList(html, {
      ...source,
      selector: '.news-list > a[href*="/news/"]',
    });
    expect(items.map((item) => item.title)).toEqual(["Direct"]);
  });

  it("resolves relative links against the page or a <base> tag", () => {
    const html = `<base href="https://e.com/en/"><a href="news/item">Item</a>`;
    const items = parseHtmlList(html, { name: "b", url: "https://e.com/press", type: "html-list" });
    expect(items[0].url).toBe("https://e.com/en/news/item");
  });

  it("ignores links inside scripts and templates", () => {
    const html = `<script>const t = '<a href="/news/fake">Fake</a>';</script><template><a href="/news/tpl">Tpl</a></template><a href="/news/real">Real</a>`;
    const items = parseHtmlList(html, { name: "c", url: "https://e.com/news", type: "html-list" });
    expect(items.map((item) => item.title)).toEqual(["Real"]);
  });

  it("falls back to aria-label when the label is generic", () => {
    const html = `<a href="/news/item" aria-label="A real headline"><span>Read more</span></a>`;
    const items = parseHtmlList(html, { name: "d", url: "https://e.com/news", type: "html-list" });
    expect(items[0].title).toBe("A real headline");
  });

  it("without a selector keeps article-shaped internal paths only", () => {
    const html = `<nav><a href="/about">About</a><a href="/category/robots">Robots</a></nav><a href="/news/one">One</a><a href="https://other.example/news/two">Two</a>`;
    const items = parseHtmlList(html, { name: "e", url: "https://e.com/news", type: "html-list" });
    expect(items.map((item) => item.url)).toEqual(["https://e.com/news/one"]);
  });

  it("supports comma-separated class groups", () => {
    const html = `<div class="card"><a href="/news/a">A</a></div><a class="headline" href="/news/b">B</a><a href="/news/c">C</a>`;
    const items = parseHtmlList(html, {
      name: "g",
      url: "https://e.com/news",
      type: "html-list",
      selector: ".card a, a.headline",
    });
    expect(items.map((item) => item.title)).toEqual(["A", "B"]);
  });

  it("prefers the headline when one article is linked twice", () => {
    const html = `<a href="/news/x" aria-label="Read more"><img alt="arrow" src="/i.svg"></a><a href="/news/x"><h3>Real headline</h3></a>`;
    const items = parseHtmlList(html, {
      name: "h",
      url: "https://e.com/news",
      type: "html-list",
      selector: 'a[href*="/news/"]',
    });
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("Real headline");
  });

  it("throws when the source has no absolute url", () => {
    expect(() => parseHtmlList("<a href='/x'>x</a>", { name: "f" })).toThrow(/absolute url/);
  });
});

describe("normalizeSources json-list", () => {
  it("accepts a json-list source and defaults method and field names", () => {
    const [source] = normalizeSources([
      { name: "KUKA", url: "https://k.example/api/news", type: "json-list" },
    ]);
    expect(source).toMatchObject({
      type: "json-list",
      method: "GET",
      body: null,
      itemsPath: null,
      titleField: "title",
      urlField: "url",
      dateField: "date",
      urlTemplate: null,
      baseUrl: null,
    });
  });

  it("keeps the declared method, body and field paths", () => {
    const [source] = normalizeSources([
      {
        name: "KUKA",
        url: "https://www.kuka.com/api/news/GetPublications",
        type: "json-list",
        method: "post",
        body: "contextid=abc&offset=0&count=209",
        itemsPath: "items",
        titleField: "headline",
        urlField: "href",
        dateField: "dateISO",
      },
    ]);
    expect(source).toMatchObject({
      method: "POST",
      body: "contextid=abc&offset=0&count=209",
      itemsPath: "items",
      titleField: "headline",
      urlField: "href",
      dateField: "dateISO",
    });
  });

  it("serializes an object body as form encoding", () => {
    const [source] = normalizeSources([
      {
        name: "KUKA",
        url: "https://k.example/api/news",
        type: "json-list",
        method: "POST",
        body: { count: 209, offset: 0 },
      },
    ]);
    expect(source.body).toBe("count=209&offset=0");
  });

  it("accepts a urlTemplate next to a baseUrl", () => {
    const [source] = normalizeSources([
      {
        name: "ABB",
        url: "https://www.abb.com/conf/newsbank.json",
        type: "json-list",
        itemsPath: "news.items",
        urlTemplate: "/global/en/news/{id}/{newsUrlTitleSlug}",
        baseUrl: "https://www.abb.com",
      },
    ]);
    expect(source).toMatchObject({
      itemsPath: "news.items",
      urlTemplate: "/global/en/news/{id}/{newsUrlTitleSlug}",
      baseUrl: "https://www.abb.com",
    });
  });

  it("rejects a relative json-list url", () => {
    expect(() => normalizeSources([{ name: "a", url: "/news", type: "json-list" }])).toThrow(
      /absolute url/,
    );
  });

  it("rejects an unsupported method", () => {
    expect(() =>
      normalizeSources([
        { name: "a", url: "https://e.com/api", type: "json-list", method: "PATCH" },
      ]),
    ).toThrow(/unsupported method/);
  });

  it("rejects a broken baseUrl and a non-string body", () => {
    expect(() =>
      normalizeSources([
        { name: "a", url: "https://e.com/api", type: "json-list", baseUrl: "nope" },
      ]),
    ).toThrow(/invalid baseUrl/);
    expect(() =>
      normalizeSources([{ name: "a", url: "https://e.com/api", type: "json-list", body: 5 }]),
    ).toThrow(/invalid body/);
  });

  it("rejects a body on a GET source", () => {
    expect(() =>
      normalizeSources([
        { name: "a", url: "https://e.com/api", type: "json-list", method: "GET", body: "x=1" },
      ]),
    ).toThrow(/use POST/);
  });
});

describe("parseJsonList", () => {
  const kuka = {
    name: "KUKA",
    url: "https://www.kuka.com/api/news/GetPublications",
    type: "json-list",
    itemsPath: "items",
    titleField: "headline",
    urlField: "href",
    dateField: "dateISO",
  };

  it("reads a dotted itemsPath and the declared fields", () => {
    const json = {
      count: 2,
      items: [
        {
          href: "https://www.kuka.com/en-us/company/press/news/2026/10/partnership?utm_source=x",
          headline: "KUKA &amp; KOMSA partnership",
          dateISO: "2026-10-22T13:24:00.0000000+02:00",
        },
        { headline: "No link", dateISO: null },
      ],
      facets: [],
    };
    expect(parseJsonList(json, kuka)).toEqual([
      {
        source: "KUKA",
        title: "KUKA & KOMSA partnership",
        url: "https://www.kuka.com/en-us/company/press/news/2026/10/partnership",
        date: "2026-10-22T11:24:00.000Z",
      },
    ]);
  });

  it("builds urls from a template and a baseUrl", () => {
    const source = {
      name: "ABB",
      url: "https://www.abb.com/conf/abbcommon/services/newsbank.json",
      type: "json-list",
      itemsPath: "news.items",
      titleField: "title",
      dateField: "scheduledPublishDate",
      urlTemplate: "/global/en/news/{id}/{newsUrlTitleSlug}",
      baseUrl: "https://www.abb.com",
    };
    const json = {
      news: {
        count: 1,
        items: [
          {
            id: 139696,
            title: "Q3 2026 results",
            newsUrlTitleSlug: "q3-2026-results",
            scheduledPublishDate: "2026-10-20T04:51:22.3870000Z",
          },
        ],
      },
    };
    expect(parseJsonList(json, source)).toEqual([
      {
        source: "ABB",
        title: "Q3 2026 results",
        url: "https://www.abb.com/global/en/news/139696/q3-2026-results",
        date: "2026-10-20T04:51:22.387Z",
      },
    ]);
  });

  it("skips an item whose template field is missing", () => {
    const source = {
      name: "ABB",
      url: "https://www.abb.com/conf/newsbank.json",
      type: "json-list",
      itemsPath: "news.items",
      urlTemplate: "/global/en/news/{id}/{newsUrlTitleSlug}",
      baseUrl: "https://www.abb.com",
    };
    const json = { news: { items: [{ id: 1, title: "Only an id" }] } };
    expect(parseJsonList(json, source)).toEqual([]);
  });

  it("falls back to a root array or a top-level items array", () => {
    expect(parseJsonList([{ title: "Root", url: "/news/root" }], { name: "a", url: "https://e.com/api" })).toEqual([
      { source: "a", title: "Root", url: "https://e.com/news/root", date: null },
    ]);
    expect(
      parseJsonList({ items: [{ title: "Wrapped", url: "https://e.com/news/wrapped" }] }, {
        name: "b",
        url: "https://e.com/api",
      }),
    ).toHaveLength(1);
  });

  it("dedups by canonical url and drops unusable rows", () => {
    const json = {
      items: [
        { title: "One", url: "https://e.com/news/one?utm_source=x" },
        { title: "One again", url: "http://e.com/news/one" },
        { title: "", url: "https://e.com/news/empty-title" },
        { title: "Mail", url: "mailto:press@e.com" },
        { title: "Relative", url: "/news/relative" },
        "not an object",
      ],
    };
    expect(parseJsonList(json, { name: "c", url: "https://e.com/api" })).toEqual([
      { source: "c", title: "One", url: "https://e.com/news/one", date: null },
      { source: "c", title: "Relative", url: "https://e.com/news/relative", date: null },
    ]);
  });

  it("keeps an unparseable date as text", () => {
    const json = { items: [{ title: "T", url: "https://e.com/t", date: "last Tuesday" }] };
    expect(parseJsonList(json, { name: "d", url: "https://e.com/api" })[0].date).toBe("last Tuesday");
  });

  it("throws when itemsPath names no array", () => {
    expect(() =>
      parseJsonList({ data: [] }, { name: "e", url: "https://e.com/api", itemsPath: "items" }),
    ).toThrow(/itemsPath "items"/);
  });

  it("throws when the body holds no article array", () => {
    expect(() => parseJsonList({ count: 0 }, { name: "f", url: "https://e.com/api" })).toThrow(
      /no article array/,
    );
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