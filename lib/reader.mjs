// Reader-proxy fallback for the pages a direct fetch cannot read: a WAF block
// (403) or a body that only exists after JavaScript runs. Native fetch only, no
// dependencies.
//
// The public proxy renders the page in a real browser and answers with a
// plain-text document: a short metadata header (`Title:`, `URL Source:`,
// `Published Time:`, `Warning:`) and the article as markdown after
// `Markdown Content:`. What it does not do: solve captchas, follow a login, or
// open a paywall; those stay failures and must be recorded as such.

/** Public reader-proxy base. `READER_PROXY` overrides it for a self-hosted mirror. */
export const READER_ENDPOINT = process.env.READER_PROXY || "https://r.jina.ai/";

/**
 * UA for the proxy request, not for the publisher: the proxy fetches the page
 * with its own browser. Its Cloudflare shield answers HTTP 403 to a desktop
 * Chrome UA sent by a non-browser client, so a plain Mozilla-compatible string
 * is the one that works. `userAgent` overrides it per call.
 */
export const READER_UA = "Mozilla/5.0 (compatible; opencode-skills/1.0)";

const MARKER = /\n\s*Markdown Content:\s*\n/i;

/** Proxy URL for a target. The target is appended verbatim, query string included. */
export function readerUrl(url, endpoint = READER_ENDPOINT) {
  return `${String(endpoint).replace(/\/+$/, "")}/${url}`;
}

/** First `Name: value` line of the metadata header, or null. */
function headerField(lines, name) {
  const prefix = `${name.toLowerCase()}:`;
  const hit = lines.find((line) => line.toLowerCase().startsWith(prefix));
  return hit ? hit.slice(prefix.length).trim() || null : null;
}

/**
 * Split the proxy document into its metadata header and the markdown body.
 * A bare markdown response without the marker is kept whole, so a proxy that
 * changes its envelope still yields text instead of nothing.
 */
export function parseReaderDocument(raw) {
  const text = String(raw ?? "");
  const marker = MARKER.exec(text);
  const head = marker ? text.slice(0, marker.index) : "";
  const body = marker ? text.slice(marker.index + marker[0].length) : text;
  const lines = head.split(/\r?\n/);
  return {
    title: headerField(lines, "Title"),
    url: headerField(lines, "URL Source"),
    publishedTime: headerField(lines, "Published Time"),
    warnings: lines
      .filter((line) => line.toLowerCase().startsWith("warning:"))
      .map((line) => line.slice("warning:".length).trim())
      .filter(Boolean),
    text: body.trim(),
  };
}

/** A proxy error body is JSON when the proxy refused, HTML when Cloudflare did. */
function proxyError(status, raw) {
  const body = String(raw ?? "");
  try {
    const json = JSON.parse(body);
    const name = json?.name ? `${json.name}: ` : "";
    if (json?.message) return `reader HTTP ${status}: ${name}${json.message}`;
  } catch {
    // not JSON, fall through to the plain-text form
  }
  const short = body.replace(/\s+/g, " ").trim().slice(0, 200);
  return `reader HTTP ${status}${short ? `: ${short}` : ""}`;
}

/**
 * Fetch `url` through the reader proxy.
 *
 * Returns `{ ok, text, title, contentType, status, url, error, ... }` where
 * `text` is the article body (markdown, header stripped) and `status` is the
 * proxy's HTTP status, not the publisher's: the proxy does not expose the
 * origin status. `ok` is false for a non-2xx answer, a timeout, a network
 * error, an empty body, or a body shorter than `minChars`.
 */
export async function fetchViaReader(url, options = {}) {
  const {
    timeoutMs = 30000,
    endpoint = READER_ENDPOINT,
    fetchImpl = fetch,
    userAgent = READER_UA,
    minChars = 0,
  } = options;

  const result = {
    ok: false,
    text: null,
    title: null,
    contentType: null,
    status: null,
    url: String(url ?? ""),
    publishedTime: null,
    warnings: [],
    error: null,
  };

  if (!/^https?:\/\//i.test(result.url)) {
    result.error = "invalid url: expected http(s)";
    return result;
  }

  let raw;
  try {
    const res = await fetchImpl(readerUrl(result.url, endpoint), {
      headers: {
        "User-Agent": userAgent,
        Accept: "text/plain, text/markdown;q=0.9, */*;q=0.8",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
    });
    result.status = res.status;
    result.contentType = res.headers?.get?.("content-type") ?? null;
    raw = await res.text();
    if (!res.ok) {
      result.error = proxyError(res.status, raw);
      return result;
    }
  } catch (e) {
    const timedOut = e?.name === "TimeoutError" || e?.name === "AbortError";
    result.error = timedOut ? `reader timeout after ${timeoutMs}ms` : `reader fetch error: ${e?.message ?? e}`;
    return result;
  }

  const doc = parseReaderDocument(raw);
  result.title = doc.title;
  result.publishedTime = doc.publishedTime;
  result.warnings = doc.warnings;
  result.text = doc.text || null;

  // The proxy answers 200 with an empty body when the origin itself refused,
  // so an empty body is a failure even without a char floor.
  const chars = result.text?.length ?? 0;
  if (chars === 0) {
    result.error = "reader returned an empty body";
    return result;
  }
  if (chars < minChars) {
    result.error = `reader body too short (${chars} chars < ${minChars})`;
    return result;
  }

  result.ok = true;
  return result;
}
