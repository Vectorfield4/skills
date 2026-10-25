import { afterEach, describe, expect, it, vi } from "vitest";
import { normalizeSources } from "#lib/article-search.mjs";
import { fetchSource } from "../skills/data/news-fetcher/scripts/fetch-candidates.mjs";

const KUKA_JSON = {
  count: 209,
  items: [
    {
      href: "https://www.kuka.com/en-us/company/press/news/2026/10/partnership",
      headline: "KUKA Group and KOMSA Enter Strategic Partnership",
      dateISO: "2026-10-22T13:24:00.0000000+02:00",
    },
    {
      href: "https://www.kuka.com/en-us/company/press/news/2026/10/second",
      headline: "Second release",
      dateISO: "2026-10-01T09:00:00.0000000+02:00",
    },
  ],
  facets: [],
};

const ABB_JSON = {
  news: {
    count: 727,
    page: 0,
    size: 2,
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

function mockFetch(body, inspect) {
  const spy = vi.fn(async (url, init) => {
    inspect?.({ url, init });
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", spy);
  return spy;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchSource json-list", () => {
  const kuka = normalizeSources([
    {
      name: "KUKA",
      url: "https://www.kuka.com/api/news/GetPublications",
      type: "json-list",
      method: "POST",
      body: "contextid=abc&offset=0&count=209",
      itemsPath: "items",
      titleField: "headline",
      urlField: "href",
      dateField: "dateISO",
      lang: "en",
      country: "DE",
      weight: 1.1,
    },
  ])[0];

  it("posts the form body and returns candidates with source meta", async () => {
    let seen;
    mockFetch(KUKA_JSON, (request) => {
      seen = request;
    });
    const items = await fetchSource(kuka);
    expect(seen.init.method).toBe("POST");
    expect(seen.init.body).toBe("contextid=abc&offset=0&count=209");
    expect(seen.init.headers["Content-Type"]).toMatch(/x-www-form-urlencoded/);
    expect(seen.init.headers["User-Agent"]).toMatch(/Mozilla\/5\.0/);
    expect(items).toEqual([
      {
        source: "KUKA",
        title: "KUKA Group and KOMSA Enter Strategic Partnership",
        url: "https://www.kuka.com/en-us/company/press/news/2026/10/partnership",
        date: "2026-10-22T11:24:00.000Z",
        lang: "en",
        country: "DE",
        weight: 1.1,
      },
      {
        source: "KUKA",
        title: "Second release",
        url: "https://www.kuka.com/en-us/company/press/news/2026/10/second",
        date: "2026-10-01T07:00:00.000Z",
        lang: "en",
        country: "DE",
        weight: 1.1,
      },
    ]);
  });

  it("gets a plain url when the source declares no body", async () => {
    const abb = normalizeSources([
      {
        name: "ABB",
        url: "https://www.abb.com/conf/abbcommon/services/newsbank.json?requestType=getNewsList&feedId=x&pageNumber=0&cultureInfo=en&pageSize=2",
        type: "json-list",
        itemsPath: "news.items",
        urlTemplate: "/global/en/news/{id}/{newsUrlTitleSlug}",
        baseUrl: "https://www.abb.com",
        dateField: "scheduledPublishDate",
      },
    ])[0];
    let seen;
    mockFetch(ABB_JSON, (request) => {
      seen = request;
    });
    const items = await fetchSource(abb);
    expect(seen.init.method ?? "GET").toBe("GET");
    expect(seen.init.body).toBeUndefined();
    expect(items).toEqual([
      {
        source: "ABB",
        title: "Q3 2026 results",
        url: "https://www.abb.com/global/en/news/139696/q3-2026-results",
        date: "2026-10-20T04:51:22.387Z",
        lang: null,
        country: null,
        weight: 1.0,
      },
    ]);
  });

  it("skips a source whose endpoint fails instead of throwing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 403, statusText: "Forbidden" })),
    );
    await expect(fetchSource(kuka)).resolves.toEqual([]);
  });

  it("skips a source whose payload is not json", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>shell</html>", { status: 200 })));
    await expect(fetchSource(kuka)).resolves.toEqual([]);
  });
});
