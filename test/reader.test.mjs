import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchViaReader, parseReaderDocument, READER_UA, readerUrl } from "../lib/reader.mjs";
import { readerFetch } from "../skills/data/parse-fallback/scripts/reader-fetch.mjs";

const PARAGRAPH = "alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu. ";
const BODY = PARAGRAPH.repeat(8).trim();

const READER_DOC = `Title: Reservoir launches new agricultural robotics incubator

URL Source: https://blocked.example/a

Published Time: 2026-10-20T19:40:05+00:00

Warning: This page maybe not yet fully loaded, consider explicitly specify a timeout.

Markdown Content:
${BODY}
`;

function response(status, body, contentType = "text/plain; charset=utf-8") {
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

describe("parseReaderDocument", () => {
  it("splits the metadata header from the markdown body", () => {
    const doc = parseReaderDocument(READER_DOC);
    expect(doc.title).toBe("Reservoir launches new agricultural robotics incubator");
    expect(doc.url).toBe("https://blocked.example/a");
    expect(doc.publishedTime).toBe("2026-10-20T19:40:05+00:00");
    expect(doc.warnings).toHaveLength(1);
    expect(doc.text).toBe(BODY);
    expect(doc.text).not.toContain("Title:");
  });

  it("keeps a bare markdown answer whole and reports no title", () => {
    const doc = parseReaderDocument("# Heading\n\nbody text");
    expect(doc.title).toBeNull();
    expect(doc.warnings).toEqual([]);
    expect(doc.text).toBe("# Heading\n\nbody text");
  });
});

describe("fetchViaReader", () => {
  it("builds the proxy URL by appending the target verbatim", () => {
    expect(readerUrl("https://example.com/a?b=c")).toBe("https://r.jina.ai/https://example.com/a?b=c");
    expect(readerUrl("https://example.com/a", "https://mirror.test/")).toBe("https://mirror.test/https://example.com/a");
  });

  it("returns the body, title, content type and proxy status", async () => {
    const fetchMock = stubFetch(async () => response(200, READER_DOC));
    const result = await fetchViaReader("https://blocked.example/a");

    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
    expect(result.contentType).toBe("text/plain; charset=utf-8");
    expect(result.title).toBe("Reservoir launches new agricultural robotics incubator");
    expect(result.text).toBe(BODY);
    expect(result.error).toBeNull();
    expect(result.warnings).toHaveLength(1);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://r.jina.ai/https://blocked.example/a");
    expect(init.headers["User-Agent"]).toBe(READER_UA);
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("reports the proxy refusal message instead of a bare status", async () => {
    const body = JSON.stringify({
      data: null,
      code: 403,
      name: "AbuseAlleviationError",
      status: 40305,
      message: "Anonymous access to domain news.google.com blocked",
    });
    stubFetch(async () => response(403, body, "application/json; charset=utf-8"));

    const result = await fetchViaReader("https://news.google.com/rss/articles/abc");
    expect(result.ok).toBe(false);
    expect(result.status).toBe(403);
    expect(result.text).toBeNull();
    expect(result.error).toContain("reader HTTP 403");
    expect(result.error).toContain("AbuseAlleviationError");
    expect(result.error).toContain("Anonymous access");
  });

  it("records a network error with a null status", async () => {
    stubFetch(async () => {
      throw new Error("getaddrinfo ENOTFOUND r.jina.ai");
    });
    const result = await fetchViaReader("https://blocked.example/a");
    expect(result.ok).toBe(false);
    expect(result.status).toBeNull();
    expect(result.error).toContain("reader fetch error");
    expect(result.error).toContain("ENOTFOUND");
  });

  it("gives up at the timeout", async () => {
    stubFetch(
      (_url, { signal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason));
        }),
    );
    const result = await fetchViaReader("https://slow.example/a", { timeoutMs: 10 });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("reader timeout after 10ms");
    expect(result.status).toBeNull();
  });

  it("rejects a body under the char floor but keeps it for inspection", async () => {
    stubFetch(async () => response(200, "Title: Empty\n\nMarkdown Content:\nshort"));
    const result = await fetchViaReader("https://thin.example/a", { minChars: 200 });
    expect(result.ok).toBe(false);
    expect(result.text).toBe("short");
    expect(result.error).toBe("reader body too short (5 chars < 200)");
  });

  it("treats a 200 with an empty body as a failure", async () => {
    stubFetch(async () => response(200, "Title: 403 Forbidden\n\nURL Source: https://blocked.example/a\n\nMarkdown Content:\n"));
    const result = await fetchViaReader("https://blocked.example/a");
    expect(result.ok).toBe(false);
    expect(result.status).toBe(200);
    expect(result.title).toBe("403 Forbidden");
    expect(result.text).toBeNull();
    expect(result.error).toBe("reader returned an empty body");
  });

  it("does not call the proxy for a non-http url", async () => {
    const fetchMock = stubFetch(async () => response(200, READER_DOC));
    const result = await fetchViaReader("blocked.example/a");
    expect(result.ok).toBe(false);
    expect(result.error).toBe("invalid url: expected http(s)");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("reader-fetch CLI result", () => {
  it("shapes a readable page as method reader-proxy", async () => {
    stubFetch(async () => response(200, READER_DOC));
    const result = await readerFetch("https://blocked.example/a");
    expect(result.status).toBe("ok");
    expect(result.method).toBe("reader-proxy");
    expect(result.textContent).toBe(BODY);
    expect(result.charCount).toBe(BODY.length);
    expect(result.wordCount).toBe(BODY.split(/\s+/).length);
    expect(result.httpStatus).toBe(200);
    expect(result.attempts).toEqual([{ method: "reader-proxy", ok: true, error: null }]);
  });

  it("keeps method none and the attempt trail when the proxy fails", async () => {
    stubFetch(async () => response(403, "403 Forbidden", "text/html"));
    const result = await readerFetch("https://blocked.example/a");
    expect(result.status).toBe("failed");
    expect(result.method).toBe("none");
    expect(result.textContent).toBeNull();
    expect(result.attempts).toEqual([
      { method: "reader-proxy", ok: false, error: "reader HTTP 403: 403 Forbidden" },
    ]);
  });

  it("applies the same min-words gate as the rest of the chain", async () => {
    stubFetch(async () => response(200, "Title: Thin\n\nMarkdown Content:\nthree words only"));
    const result = await readerFetch("https://thin.example/a");
    expect(result.status).toBe("failed");
    expect(result.error).toBe("reader-proxy body too short (3 words < 80)");
    expect(result.charCount).toBe("three words only".length);
  });
});
