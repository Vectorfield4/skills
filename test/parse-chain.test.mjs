import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SOURCES, SOURCE_VOCAB, scanParsers, sourceSupport } from "../lib/parse-catalog.mjs";
import { fallback } from "../skills/data/parse-fallback/scripts/fallback.mjs";
import { parse } from "../skills/data/try-parse-url/scripts/parse.mjs";
import { triage } from "../skills/data/parse-failure-triage/scripts/triage.mjs";
import { review } from "../skills/data/parse-gap-review/scripts/review.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

const PARAGRAPH = "alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu. ";
const LONG_HTML = `<!doctype html><html><head><title>Test article</title></head><body>
<article>
<h1>Test article</h1>
<p>${PARAGRAPH.repeat(4)}</p>
<p>${PARAGRAPH.repeat(4)}</p>
<p>${PARAGRAPH.repeat(4)}</p>
</article>
</body></html>`;

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

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("attempts in try-parse-url", () => {
  it("records the pre-check and the Readability pass", async () => {
    stubFetch(async () => response(200, LONG_HTML));
    const result = await parse("https://example.com/a");
    expect(result.status).toBe("ok");
    expect(result.attempts).toEqual([
      { method: "http-precheck", ok: true, error: null },
      { method: "readability", ok: true, error: null },
    ]);
  });

  it("records a blocked pre-check and stops", async () => {
    stubFetch(async () => response(403, "blocked"));
    const result = await parse("https://example.com/a");
    expect(result.status).toBe("failed");
    expect(result.attempts).toEqual([
      { method: "http-precheck", ok: false, error: "HTTP 403" },
    ]);
  });
});

describe("attempts in parse-fallback", () => {
  it("returns the base parse attempts when the base parse wins", async () => {
    stubFetch(async () => response(200, LONG_HTML));
    const result = await fallback("https://example.com/a");
    expect(result.method).toBe("readability");
    expect(result.attempts.map((a) => a.method)).toEqual(["http-precheck", "readability"]);
  });

  it("accumulates every fallback method that failed", async () => {
    stubFetch(async () => response(403, "blocked"));
    const result = await fallback("https://news.google.com/rss/articles/abc");
    expect(result.status).toBe("failed");
    const methods = result.attempts.map((a) => a.method);
    expect(methods).toEqual(
      expect.arrayContaining([
        "http-precheck",
        "ua-retry",
        "decode-redirect",
        "google-cache",
        "archive-org",
      ]),
    );
    expect(result.attempts.every((a) => a.ok === false)).toBe(true);
  });

  it("keeps the winning attempt in the trail", async () => {
    let call = 0;
    stubFetch(async () => {
      call++;
      return call === 1 ? response(403, "blocked") : response(200, LONG_HTML);
    });
    const result = await fallback("https://blocked.example/a");
    expect(result.method).toBe("ua-retry");
    expect(result.attempts.at(-1)).toMatchObject({ method: "ua-retry", ok: true });
  });
});

describe("attempts through triage", () => {
  const batch = {
    results: [
      {
        url: "https://a.example/x",
        status: "failed",
        error: "HTTP 403",
        attempts: [
          { method: "http-precheck", ok: false, error: "HTTP 403" },
          { method: "ua-retry", ok: false, error: "HTTP 403 (UA: Googlebot)" },
        ],
      },
      {
        url: "https://a.example/y",
        status: "failed",
        error: "HTTP 403",
        attempts: [
          { method: "http-precheck", ok: false, error: "HTTP 403" },
          { method: "ua-retry", ok: false, error: "HTTP 403 (UA: mobile Chrome)" },
        ],
      },
      {
        url: "https://b.example/report",
        status: "failed",
        error: "non-HTML content-type: application/pdf",
        attempts: [{ method: "http-precheck", ok: true, error: null }],
      },
      { url: "https://ok.example/a", status: "ok", method: "readability", attempts: [] },
    ],
  };

  it("carries attempts into every gap", () => {
    const report = triage(batch);
    expect(report.failed).toBe(3);
    const gap = report.gaps.find((g) => g.url.endsWith("/x"));
    expect(gap.reason).toBe("waf-403");
    expect(gap.attempts).toHaveLength(2);
    expect(gap.attemptedMethods).toEqual(["http-precheck", "ua-retry"]);
  });

  it("aggregates attempts per reason", () => {
    const report = triage(batch);
    expect(report.attemptedByReason["waf-403"]["ua-retry"]).toEqual({
      tried: 2,
      ok: 0,
      failed: 2,
    });
  });
});

describe("parse-gap-review checks what already exists", () => {
  const catalog = scanParsers(ROOT);

  const gaps = {
    gaps: [
      ...["https://a.example/1", "https://a.example/2", "https://news.google.com/1"].map((url) => ({
        url,
        reason: "waf-403",
        suggestedFallback: "ua-retry",
        attempts: [
          { method: "http-precheck", ok: false, error: "HTTP 403" },
          { method: "ua-retry", ok: false, error: "HTTP 403" },
        ],
      })),
      ...["https://b.example/report"].map((url) => ({
        url,
        reason: "non-html",
        suggestedFallback: "pdf-extractor",
        attempts: [{ method: "http-precheck", ok: true, error: null }],
      })),
    ],
  };

  it("scans the real scripts, not a hardcoded list", () => {
    const files = catalog.files.map((f) => f.file);
    expect(files).toContain("skills/data/parse-fallback/scripts/fallback.mjs");
    expect(files).toContain("skills/data/parse-fallback/scripts/google-news.mjs");
    expect(files).toContain("skills/data/try-parse-url/scripts/parse.mjs");

    const fallbackFile = catalog.files.find((f) => f.file.endsWith("parse-fallback/scripts/fallback.mjs"));
    expect(fallbackFile.functions).toEqual(expect.arrayContaining(["fallback", "run"]));
    expect(fallbackFile.capabilities.map((c) => c.id)).toEqual(
      expect.arrayContaining(["decode-redirect", "ua-retry", "archive-org"]),
    );

    const googleNewsFile = catalog.files.find((f) => f.file.endsWith("parse-fallback/scripts/google-news.mjs"));
    const resolveCover = googleNewsFile.capabilities.find((c) => c.id === "google-news-resolve");
    expect(resolveCover).toMatchObject({ reason: "js-interstitial", symbol: "resolveGoogleNews" });
  });

  it("reports the Google News interstitial as implemented, not as a new parser", () => {
    const { groups } = review(
      {
        gaps: [
          {
            url: "https://news.google.com/rss/articles/CBMiABC",
            reason: "js-interstitial",
            suggestedFallback: "decode-redirect",
            attempts: [{ method: "google-news-page", ok: false, error: "HTTP 429" }],
          },
        ],
      },
      1,
      { catalog },
    );
    const group = groups.find((g) => g.reason === "js-interstitial");
    expect(group.proposal.alreadyImplemented).toBe(true);
    expect(group.proposal.coveredBy.map((c) => c.capability).sort()).toEqual(["decode-redirect", "google-news-resolve"]);
    expect(group.proposal.action).toMatch(/^Extend the existing parser/);
  });

  it("points the Google News resolution at the RPC resolver", () => {
    const googleNewsFile = catalog.files.find((f) => f.file.endsWith("parse-fallback/scripts/google-news.mjs"));
    expect(googleNewsFile.capabilities).toEqual(
      expect.arrayContaining([
        { reason: "js-interstitial", id: "google-news-resolve", symbol: "resolveGoogleNews" },
      ]),
    );
  });

  it("names the reader-proxy step as the page reader for WAF and JS shells", () => {
    const readerFile = catalog.files.find((f) => f.file.endsWith("parse-fallback/scripts/reader-fetch.mjs"));
    expect(readerFile.capabilities).toEqual(
      expect.arrayContaining([
        { reason: "waf-403", id: "reader-proxy", symbol: "readerFetch" },
        { reason: "empty-or-js", id: "reader-proxy", symbol: "readerFetch" },
      ]),
    );

    const { groups } = review(
      {
        gaps: [
          {
            url: "https://blocked.example/a",
            reason: "waf-403",
            suggestedFallback: "ua-retry",
            attempts: [{ method: "reader-proxy", ok: false, error: "reader HTTP 429" }],
          },
        ],
      },
      1,
      { catalog },
    );
    const waf = groups.find((g) => g.reason === "waf-403");
    expect(waf.proposal.coveredBy.map((c) => c.capability)).toEqual(["ua-retry", "reader-proxy"]);
    expect(waf.proposal.alreadyImplemented).toBe(true);
  });

  it("marks a covered reason as implemented and points at the script", () => {
    const { groups } = review(gaps, 1, { catalog });
    const waf = groups.find((g) => g.reason === "waf-403");
    expect(waf.proposal.alreadyImplemented).toBe(true);
    expect(waf.proposal.coveredBy[0].file).toBe("skills/data/parse-fallback/scripts/fallback.mjs");
    expect(waf.proposal.coveredBy[0].function).toBe("fallback");
    expect(waf.proposal.action).toMatch(/^Extend the existing parser/);
    expect(waf.proposal.action).not.toMatch(/^New parser/);
  });

  it("still proposes a new parser when nothing covers the reason", () => {
    const { groups } = review(gaps, 1, { catalog });
    const nonHtml = groups.find((g) => g.reason === "non-html");
    expect(nonHtml.proposal.alreadyImplemented).toBe(false);
    expect(nonHtml.proposal.action).toMatch(/^New parser/);
  });

  it("groups by reason and reports the methods already tried", () => {
    const { groups } = review(gaps, 1, { catalog });
    expect(groups.map((g) => g.reason).sort()).toEqual(["non-html", "waf-403"]);
    const waf = groups.find((g) => g.reason === "waf-403");
    expect(waf.count).toBe(3);
    expect(waf.domains.map((d) => d.domain).sort()).toEqual(["a.example", "news.google.com"]);
    expect(waf.attempts.map((a) => a.method).sort()).toEqual(["http-precheck", "ua-retry"]);
  });
});

describe("discovery source types in the catalog", () => {
  const catalog = scanParsers(ROOT);

  it("declares the source vocabulary, including the two list types", () => {
    expect([...SOURCE_VOCAB].sort()).toEqual(["atom", "hn", "html-list", "json-list", "rss"]);
    for (const type of SOURCE_VOCAB) expect(SOURCES[type]).toEqual(expect.any(String));
  });

  it("reports html-list as consumed by the fetchers", () => {
    const support = sourceSupport(catalog);
    expect(support["html-list"].map((s) => s.file)).toEqual(
      expect.arrayContaining([
        "lib/article-search.mjs",
        "skills/data/news-fetcher/scripts/fetch-candidates.mjs",
        "skills/data/thematic-article-search/scripts/search.mjs",
      ]),
    );
  });

  it("keeps source types out of the parse-method list", () => {
    const fallbackFile = catalog.files.find((f) => f.file.endsWith("parse-fallback/scripts/fallback.mjs"));
    expect(fallbackFile.methods).toContain("reader-proxy");
    expect(fallbackFile.methods).not.toContain("html-list");
    expect(fallbackFile.methods).not.toContain("json-list");
  });

  it("keeps a slot for json-list until a fetcher declares it", () => {
    expect(sourceSupport(catalog)).toHaveProperty("json-list");
  });
});
