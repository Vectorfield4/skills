import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildBatchexecuteBody,
  decodeNewsId,
  extractPageTokens,
  googleNewsId,
  isGoogleNewsUrl,
  localeFromUrl,
  parseBatchexecuteResponse,
  queryParamUrl,
  resolveGoogleNews,
} from "../skills/data/parse-fallback/scripts/google-news.mjs";
import { fallback } from "../skills/data/parse-fallback/scripts/fallback.mjs";

// A real id from docs/research/candidates.json: protobuf with an opaque
// `AU_yq...` payload, no publisher URL inside.
const REAL_ID =
  "CBMilgFBVV95cUxOVHRuekZtaEVYZnp6VndkZTZLN1RKT25jNTgweG80UWR5ZjlmUlFGc3FtZWI2SXFYZUkzQTUybldDLVkwVm1qSVhuSVVRSUl4My1VZGxmaV8ybnpMVU5STWxLbWYyd3VYQkJwY3JvSmgtSmpjc1Y5TWVmVERBV0lyY203SGZXZEJkTUFGSjBzOGpDR2V2dWc";
const REAL_RSS_URL = `https://news.google.com/rss/articles/${REAL_ID}?oc=5`;
const PUBLISHER_URL = "https://news.stanford.edu/stories/2026/10/autonomous-robotics-education-curriculum-textbook";

const PAGE_HTML = `<!doctype html><html><body><c-wiz><div jscontroller="aLI87" jsaction="rcuQ6b:npT2md" data-n-a-id="${REAL_ID}" data-n-a-ts="1792763752" data-n-a-sg="AbIaSL_Tf-L9ffG4g_F6wXYYBAx3" data-n-dnlg="false"></div><c-data id="i1"></c-data></c-wiz></body></html>`;

const RPC_TEXT = `)]}'\n\n${JSON.stringify([
  ["wrb.fr", "Fbv4je", JSON.stringify(["garturlres", PUBLISHER_URL, 1]), null, null, null, ""],
  ["di", 14],
  ["af.httprm", 14, "8889958452522708529", 1],
])}`;

const PARAGRAPH = "alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu. ";
const PUBLISHER_HTML = `<!doctype html><html><head><title>Autonomous robotics</title></head><body>
<article><h1>Autonomous robotics</h1>
<p>${PARAGRAPH.repeat(4)}</p><p>${PARAGRAPH.repeat(4)}</p><p>${PARAGRAPH.repeat(4)}</p>
</article></body></html>`;

function response(status, body, contentType = "text/html; charset=utf-8") {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => (name.toLowerCase() === "content-type" ? contentType : null) },
    text: async () => body,
  };
}

function stubFetch(handler) {
  const fn = vi.fn(handler);
  vi.stubGlobal("fetch", fn);
  return fn;
}

function routeFetch(routes) {
  return async (url, init) => {
    for (const [pattern, handler] of routes) {
      if (pattern.test(String(url))) {
        return typeof handler === "function" ? handler(url, init) : handler;
      }
    }
    throw new Error(`unexpected fetch: ${url}`);
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("googleNewsId", () => {
  it("reads the id from an RSS article link and from a /articles/ link", () => {
    expect(googleNewsId(REAL_RSS_URL)).toBe(REAL_ID);
    expect(googleNewsId(`https://news.google.com/articles/${REAL_ID}?oc=5`)).toBe(REAL_ID);
  });

  it("ignores feeds and foreign hosts", () => {
    expect(googleNewsId("https://news.google.com/rss/search?q=robotics")).toBeNull();
    expect(googleNewsId("https://example.com/rss/articles/abcdefghijklmnop")).toBeNull();
    expect(googleNewsId("not a url")).toBeNull();
  });

  it("accepts a regional alias and resolves it through .com", async () => {
    const regional = `https://news.google.co.uk/rss/articles/${REAL_ID}?oc=5`;
    expect(googleNewsId(regional)).toBe(REAL_ID);
    const seen = [];
    const result = await resolveGoogleNews(regional, {
      sleep: async () => {},
      fetchImpl: async (url) => {
        seen.push(String(url));
        return /batchexecute/.test(String(url)) ? response(200, RPC_TEXT, "application/json") : response(200, PAGE_HTML);
      },
    });
    expect(result.originalUrl).toBe(PUBLISHER_URL);
    expect(seen.every((url) => url.startsWith("https://news.google.com/"))).toBe(true);
  });

  it("rejects ids too short to be an article envelope", () => {
    expect(isGoogleNewsUrl("https://news.google.com/rss/articles/abc")).toBe(false);
  });
});

describe("decodeNewsId", () => {
  it("explains that a current id carries an opaque token", () => {
    const decoded = decodeNewsId(REAL_ID);
    expect(decoded.url).toBeNull();
    expect(decoded.opaque).toMatch(/^AU_yq/);
  });

  it("still returns the URL from a legacy protobuf id", () => {
    const payload = Buffer.from("https://example.com/legacy/story", "utf8");
    const id = Buffer.concat([Buffer.from([0x08, 0x13, 0x22, payload.length]), payload]).toString("base64url");
    expect(decodeNewsId(id).url).toBe("https://example.com/legacy/story");
  });

  it("survives ids that are not protobuf", () => {
    expect(decodeNewsId("aaaaaaaaaaaaaaaaaaaa").url).toBeNull();
  });
});

describe("extractPageTokens", () => {
  it("reads data-n-a-id / ts / sg in any attribute order", () => {
    const html = `<div data-n-a-sg="SIG" data-n-a-id="ID" data-n-a-ts="42"></div>`;
    expect(extractPageTokens(html)).toEqual({ id: "ID", ts: "42", sg: "SIG" });
  });

  it("returns null on a JS shell without tokens", () => {
    expect(extractPageTokens("<html><body>enable JavaScript</body></html>")).toBeNull();
  });
});

describe("batchexecute request and response", () => {
  it("builds the Fbv4je f.req body with the page tokens", () => {
    const body = buildBatchexecuteBody({ id: REAL_ID, ts: "1792763752", sg: "SIG" });
    const freq = JSON.parse(new URLSearchParams(body).get("f.req"));
    expect(freq[0][0][0]).toBe("Fbv4je");
    const inner = JSON.parse(freq[0][0][1]);
    expect(inner[0]).toBe("garturlreq");
    expect(inner[2]).toBe(REAL_ID);
    expect(inner[3]).toBe(1792763752);
    expect(inner[4]).toBe("SIG");
  });

  it("carries the feed locale into garturlreq", () => {
    const body = buildBatchexecuteBody({ id: REAL_ID, ts: "1", sg: "SIG", locale: "JP:ja" });
    const inner = JSON.parse(JSON.parse(new URLSearchParams(body).get("f.req"))[0][0][1]);
    expect(inner[1][0][7]).toBe("JP:ja");
    expect(localeFromUrl(`https://news.google.com/rss/articles/${REAL_ID}?ceid=JP:ja&hl=ja`)).toBe("JP:ja");
    expect(localeFromUrl(`https://news.google.com/rss/articles/${REAL_ID}?gl=DE&hl=de`)).toBe("DE:de");
    expect(localeFromUrl(REAL_RSS_URL)).toBe("US:en");
  });

  it("extracts the publisher URL from the real response shape", () => {
    expect(parseBatchexecuteResponse(RPC_TEXT)).toBe(PUBLISHER_URL);
  });

  it("handles extra chunks and a raw escaped payload", () => {
    const raw = String.raw`)]}'

[["wrb.fr","Fbv4je","[\"garturlres\",\"https://example.com/a\",1]",null,null,null,""],["di",14]]`;
    expect(parseBatchexecuteResponse(raw)).toBe("https://example.com/a");
  });

  it("unwraps a google.com redirect payload", () => {
    const wrapped = encodeURIComponent("https://example.com/wrapped");
    const text = JSON.stringify([["wrb.fr", "Fbv4je", JSON.stringify(["garturlres", `https://www.google.com/url?q=${wrapped}`, 1])]]);
    expect(parseBatchexecuteResponse(text)).toBe("https://example.com/wrapped");
  });

  it("keeps a Google-owned publisher URL", () => {
    const text = JSON.stringify([
      ["wrb.fr", "Fbv4je", JSON.stringify(["garturlres", "https://blog.google/technology/ai/x", 1])],
    ]);
    expect(parseBatchexecuteResponse(text)).toBe("https://blog.google/technology/ai/x");
  });

  it("returns null when the RPC rejected the signature", () => {
    const text = `)]}'\n\n[["wrb.fr","Fbv4je",null,null,null,[3],""],["di",17]]`;
    expect(parseBatchexecuteResponse(text)).toBeNull();
  });

  it("returns null on a non-JSON body", () => {
    expect(parseBatchexecuteResponse("<html>oops</html>")).toBeNull();
  });
});

describe("resolveGoogleNews", () => {
  it("resolves through the article page and the RPC", async () => {
    const result = await resolveGoogleNews(REAL_RSS_URL, {
      fetchImpl: routeFetch([
        [/\/articles\//, response(200, PAGE_HTML)],
        [/batchexecute/, response(200, RPC_TEXT, "application/json")],
      ]),
      sleep: async () => {},
    });
    expect(result.originalUrl).toBe(PUBLISHER_URL);
    expect(result.method).toBe("batchexecute");
    expect(result.error).toBeNull();
    expect(result.attempts).toEqual([
      { method: "google-news-protobuf", ok: false, error: expect.stringContaining("opaque id token") },
      { method: "google-news-page", ok: true, error: null },
      { method: "google-news-batchexecute", ok: true, error: null },
    ]);
  });

  it("retries the article page on 429 with the injected sleep", async () => {
    let calls = 0;
    const sleep = vi.fn(async () => {});
    const result = await resolveGoogleNews(REAL_RSS_URL, {
      sleep,
      fetchImpl: routeFetch([
        [
          /\/articles\//,
          () => {
            calls++;
            return calls === 1 ? response(429, "slow down") : response(200, PAGE_HTML);
          },
        ],
        [/batchexecute/, response(200, RPC_TEXT, "application/json")],
      ]),
    });
    expect(result.originalUrl).toBe(PUBLISHER_URL);
    expect(calls).toBe(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it("does not retry when Retry-After asks for a long wait", async () => {
    const sleep = vi.fn(async () => {});
    let calls = 0;
    const longWait = {
      ok: false,
      status: 429,
      headers: { get: (name) => (name.toLowerCase() === "retry-after" ? "120" : null) },
      text: async () => "slow down",
    };
    const result = await resolveGoogleNews(REAL_RSS_URL, {
      sleep,
      fetchImpl: routeFetch([
        [
          /news\.google\.com\/articles\//,
          () => {
            calls++;
            return longWait;
          },
        ],
        [/news\.google\.com\/rss\/articles\//, response(403, "blocked")],
      ]),
    });
    expect(calls).toBe(1);
    expect(sleep).not.toHaveBeenCalled();
    expect(result.originalUrl).toBeNull();
  });

  it("reports both blocked page paths instead of guessing a URL", async () => {
    const result = await resolveGoogleNews(REAL_RSS_URL, {
      fetchImpl: routeFetch([
        [/news\.google\.com\/articles\//, response(429, "slow down")],
        [/news\.google\.com\/rss\/articles\//, response(503, "<html>We're sorry...</html>")],
      ]),
      sleep: async () => {},
    });
    expect(result.originalUrl).toBeNull();
    expect(result.method).toBeNull();
    expect(result.error).toContain("HTTP 429");
    expect(result.error).toContain("HTTP 503");
    expect(result.attempts.map((a) => a.method)).toEqual(["google-news-protobuf", "google-news-page"]);
  });

  it("fails when the page has no tokens", async () => {
    const result = await resolveGoogleNews(REAL_RSS_URL, {
      fetchImpl: routeFetch([[/\/articles\//, response(200, "<html>no tokens</html>")]]),
      sleep: async () => {},
    });
    expect(result.originalUrl).toBeNull();
    expect(result.error).toContain("no data-n-a-sg/ts");
  });

  it("fails when the RPC returns no URL", async () => {
    const result = await resolveGoogleNews(REAL_RSS_URL, {
      fetchImpl: routeFetch([
        [/\/articles\//, response(200, PAGE_HTML)],
        [/batchexecute/, response(200, `)]}'\n\n[["wrb.fr","Fbv4je",null,null,null,[3],""]]`, "application/json")],
      ]),
      sleep: async () => {},
    });
    expect(result.originalUrl).toBeNull();
    expect(result.attempts.at(-1)).toMatchObject({ method: "google-news-batchexecute", ok: false });
    expect(result.error).toContain("no publisher URL");
  });

  it("uses a url/q parameter without any network call", async () => {
    const url = `https://news.google.com/rss/articles/${REAL_ID}?url=${encodeURIComponent("https://example.com/from-param")}`;
    expect(queryParamUrl(url)).toBe("https://example.com/from-param");
    const fetchImpl = vi.fn();
    const result = await resolveGoogleNews(url, { fetchImpl });
    expect(result.originalUrl).toBe("https://example.com/from-param");
    expect(result.method).toBe("query-param");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("parse-fallback with Google News", () => {
  it("resolves the link and parses the publisher body", async () => {
    stubFetch(
      routeFetch([
        [/\/articles\//, response(200, PAGE_HTML)],
        [/batchexecute/, response(200, RPC_TEXT, "application/json")],
        [/news\.stanford\.edu/, response(200, PUBLISHER_HTML)],
      ]),
    );
    const result = await fallback(REAL_RSS_URL);
    expect(result.status).toBe("ok");
    expect(result.method).toBe("google-news");
    expect(result.resolvedUrl).toBe(PUBLISHER_URL);
    expect(result.resolvedBy).toBe("batchexecute");
    expect(result.wordCount).toBeGreaterThanOrEqual(80);
    expect(result.attempts.map((a) => a.method)).toEqual([
      "google-news-protobuf",
      "google-news-page",
      "google-news-batchexecute",
      "http-precheck",
      "readability",
    ]);
  });

  it("retries the publisher with another UA after a blocked publisher fetch", async () => {
    let publisherCalls = 0;
    stubFetch(
      routeFetch([
        [/\/articles\//, response(200, PAGE_HTML)],
        [/batchexecute/, response(200, RPC_TEXT, "application/json")],
        [
          /news\.stanford\.edu/,
          () => {
            publisherCalls++;
            return publisherCalls <= 2 ? response(403, "blocked") : response(200, PUBLISHER_HTML);
          },
        ],
      ]),
    );
    const result = await fallback(REAL_RSS_URL);
    expect(result.status).toBe("ok");
    expect(result.method).toBe("google-news");
    expect(result.resolvedUrl).toBe(PUBLISHER_URL);
    expect(result.attempts.map((a) => a.method)).toEqual([
      "google-news-protobuf",
      "google-news-page",
      "google-news-batchexecute",
      "http-precheck",
      "ua-retry",
      "ua-retry",
    ]);
    expect(result.attempts.at(-2)).toMatchObject({ method: "ua-retry", ok: false });
    expect(result.attempts.at(-1)).toMatchObject({ method: "ua-retry", ok: true });
  });

  it("keeps the full failure trail when the resolver is blocked", async () => {
    stubFetch(
      routeFetch([
        [/news\.google\.com\/rss\/articles\//, response(503, "blocked")],
        [/news\.google\.com\/articles\//, response(429, "slow down")],
        [/news\.google\.com/, response(503, "blocked")],
        [/webcache\.googleusercontent|web\.archive\.org/, response(403, "blocked")],
      ]),
    );
    const result = await fallback(REAL_RSS_URL);
    expect(result.status).toBe("failed");
    expect(result.method).toBe("none");
    expect(result.resolvedUrl).toBeNull();
    expect(result.attempts.map((a) => a.method)).toEqual(
      expect.arrayContaining([
        "google-news-protobuf",
        "google-news-page",
        "ua-retry",
        "decode-redirect",
        "google-cache",
        "archive-org",
      ]),
    );
    expect(result.attempts.filter((a) => a.method.startsWith("google-news")).every((a) => a.ok === false)).toBe(true);
  });

  it("skips the Google News resolver for a plain article URL", async () => {
    stubFetch(routeFetch([[/example\.com/, response(200, PUBLISHER_HTML)]]));
    const result = await fallback("https://example.com/story");
    expect(result.method).toBe("readability");
    expect(result.attempts.map((a) => a.method)).toEqual(["http-precheck", "readability"]);
    expect(result.resolvedUrl).toBeNull();
  });
});
