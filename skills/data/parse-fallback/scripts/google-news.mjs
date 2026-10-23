#!/usr/bin/env node
// Google News RSS article URL resolver.
//
// A `news.google.com/rss/articles/CBMi...` link is not a redirect: the id is a
// protobuf envelope whose payload is an opaque `AU_yq...` token, so the
// publisher URL is not in the URL and not in the protobuf. The article page
// carries the tokens the internal `DotsSplashUi` RPC expects:
//
//   1. GET  https://news.google.com/articles/<id>?oc=5
//      -> data-n-a-id / data-n-a-ts / data-n-a-sg
//   2. POST https://news.google.com/_/DotsSplashUi/data/batchexecute
//      f.req=[[["Fbv4je","[\"garturlreq\",...,\"<id>\",<ts>,\"<sg>\"]]]]
//      -> ["wrb.fr","Fbv4je","[\"garturlres\",\"<publisher url>\",1]",...]
//
// No API key, no headless browser. Never invents a URL: every failure is kept
// in `attempts`.

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { isEntryPoint } from "#lib/cli.mjs";
import { BROWSER_UA } from "#lib/http.mjs";

// Regional aliases (news.google.co.uk, …) serve the same app and the same
// global article ids; the resolver always talks to `.com` so the page and the
// RPC agree.
const BASE = "https://news.google.com";
const RPC_ENDPOINT = `${BASE}/_/DotsSplashUi/data/batchexecute`;
const PAGE_PATHS = ["/articles/", "/rss/articles/"];
const DEFAULT_TIMEOUT_MS = 20000;
const DEFAULT_RETRY_DELAY_MS = 1200;
const MAX_RETRY_DELAY_MS = 3000;

const PAGE_HEADERS = {
  "User-Agent": BROWSER_UA,
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

function attempt(method, ok, error = null) {
  return { method, ok: Boolean(ok), error: ok ? null : (error ?? "failed") };
}

/** `news.google.com/rss/articles/<id>` or `news.google.com/articles/<id>`. */
export function isGoogleNewsUrl(url) {
  return googleNewsId(url) !== null;
}

/** The article id from a Google News URL, or null when the URL is not one. */
export function googleNewsId(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (!/^news\.google\./i.test(parsed.hostname)) return null;
  const match = parsed.pathname.match(/\/(?:rss\/)?articles\/([^/]+)\/?$/i);
  if (!match) return null;
  const id = decodeURIComponent(match[1]);
  return /^[A-Za-z0-9_-]{16,}$/.test(id) ? id : null;
}

/** `url`/`q` parameters some Google News variants still carry. */
export function queryParamUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  for (const name of ["url", "q"]) {
    const value = parsed.searchParams.get(name);
    if (value && /^https?:\/\//i.test(value)) return value;
    if (value && /^https?%3A%2F%2F/i.test(value)) return decodeURIComponent(value);
  }
  return null;
}

/** `ceid`/`gl`+`hl` from the link, so a JP feed asks for the JP context. */
export function localeFromUrl(url) {
  try {
    const parsed = new URL(url);
    const ceid = parsed.searchParams.get("ceid");
    if (ceid && /^[A-Za-z]{2}:[a-z]{2}$/.test(ceid)) return ceid;
    const hl = parsed.searchParams.get("hl");
    const gl = parsed.searchParams.get("gl");
    if (gl && hl) return `${gl.toUpperCase()}:${hl.toLowerCase()}`;
  } catch {}
  return "US:en";
}

function base64Bytes(id) {
  const normalized = String(id).replace(/-/g, "+").replace(/_/g, "/").replace(/\s+/g, "");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  try {
    return Buffer.from(padded, "base64");
  } catch {
    return null;
  }
}

function readVarint(buf, offset) {
  let value = 0;
  let shift = 0;
  let i = offset;
  while (i < buf.length && shift < 64) {
    const byte = buf[i++];
    value += (byte & 0x7f) * 2 ** shift;
    if ((byte & 0x80) === 0) return { value, offset: i };
    shift += 7;
  }
  return null;
}

/** Length-delimited protobuf fields, the only wire type that can hold a URL. */
function protobufStrings(buf) {
  const out = [];
  let i = 0;
  while (i < buf.length && out.length < 64) {
    const key = readVarint(buf, i);
    if (!key) break;
    i = key.offset;
    const wire = key.value & 7;
    if (wire === 0) {
      const skip = readVarint(buf, i);
      if (!skip) break;
      i = skip.offset;
    } else if (wire === 1) {
      i += 8;
    } else if (wire === 2) {
      const len = readVarint(buf, i);
      if (!len || len.offset + len.value > buf.length) break;
      i = len.offset;
      out.push(buf.subarray(i, i + len.value).toString("utf8"));
      i += len.value;
    } else if (wire === 5) {
      i += 4;
    } else {
      break;
    }
  }
  return out;
}

/**
 * Legacy assemblies embedded the publisher URL in the protobuf. Current ids
 * carry `AU_yq...` instead, so this succeeds only for older links; it is kept
 * as the zero-request path and to explain why a current id cannot be decoded
 * offline.
 */
export function decodeNewsId(id) {
  const buf = base64Bytes(id);
  if (!buf || buf.length < 2) return { url: null, opaque: null };
  const strings = protobufStrings(buf);
  for (const value of strings) {
    const trimmed = value.trim();
    if (/^https?:\/\/[^\s]+$/i.test(trimmed)) return { url: trimmed, opaque: null };
  }
  const opaque = strings.find((v) => /^[A-Za-z0-9_-]{8,}$/.test(v)) ?? null;
  return { url: null, opaque: opaque ? opaque.slice(0, 12) : null };
}

/** Tokens the DotsSplashUi RPC needs, read straight from the article page. */
export function extractPageTokens(html) {
  const source = String(html ?? "");
  const attr = (name) => {
    const match = source.match(new RegExp(`data-n-a-${name}\\s*=\\s*["']([^"']+)["']`, "i"));
    return match ? match[1] : null;
  };
  const id = attr("id");
  const ts = attr("ts");
  const sg = attr("sg");
  if (!id || !ts || !sg) return null;
  return { id, ts, sg };
}

/** The `f.req` form body for a single `Fbv4je` (garturlreq) call. */
export function buildBatchexecuteBody({ id, ts, sg, locale = "US:en" }) {
  const garturlreq = JSON.stringify([
    "garturlreq",
    [
      ["X", "X", ["X", "X"], null, null, 1, 1, locale, null, 1, null, null, null, null, null, 0, 1],
      "X",
      "X",
      1,
      [1, 1, 1],
      1,
      1,
      null,
      0,
      0,
      null,
      0,
    ],
    id,
    Number(ts),
    sg,
  ]);
  const freq = JSON.stringify([[["Fbv4je", garturlreq]]]);
  return new URLSearchParams({ "f.req": freq }).toString();
}

function unwrapGoogleRedirect(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  // Only `google.<tld>/url?q=` is a redirect wrapper; `blog.google` and other
  // Google properties are publishers in their own right.
  if (!/^(?:www\.)?google\.[a-z.]+$/i.test(parsed.hostname)) return url;
  if (!/^\/(?:url|r)\/?$/.test(parsed.pathname)) return url;
  const q = parsed.searchParams.get("q") ?? parsed.searchParams.get("url");
  return q && /^https?:\/\//i.test(q) ? q : null;
}

function publisherUrl(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!/^https?:\/\//i.test(trimmed)) return null;
  if (/^https?:\/\/news\.google\./i.test(trimmed)) return null;
  return unwrapGoogleRedirect(trimmed);
}

/** First publisher URL anywhere inside a parsed payload. */
function findPublisherUrl(node, depth = 0) {
  if (depth > 8) return null;
  if (typeof node === "string") {
    const direct = publisherUrl(node);
    if (direct) return direct;
    if (node.startsWith("[") || node.startsWith("{")) {
      try {
        return findPublisherUrl(JSON.parse(node), depth + 1);
      } catch {
        return null;
      }
    }
    return null;
  }
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findPublisherUrl(item, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

function rpcRows(text) {
  const body = String(text ?? "").replace(/^\)\]\}'[^\n]*\n+/, "");
  const chunks = [body, ...body.split(/\n\n+/)];
  for (const chunk of chunks) {
    const trimmed = chunk.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed;
    } catch {}
  }
  return null;
}

/** The publisher URL out of a batchexecute response, or null. */
export function parseBatchexecuteResponse(text) {
  const rows = rpcRows(text);
  if (!rows) return null;
  for (const row of rows) {
    if (!Array.isArray(row) || row[0] !== "wrb.fr") continue;
    if (row[1] !== "Fbv4je" && row[1] != null) continue;
    const found = findPublisherUrl(row[2]);
    if (found) return found;
  }
  return findPublisherUrl(rows);
}

async function request(url, init, timeoutMs, fetchImpl = globalThis.fetch) {
  try {
    const res = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    const text = await res.text();
    return {
      ok: res.ok,
      status: res.status,
      headers: res.headers,
      text,
      error: res.ok ? null : `HTTP ${res.status}`,
    };
  } catch (e) {
    return { ok: false, status: null, headers: null, text: "", error: `fetch error: ${e.message}` };
  }
}

/** `Retry-After` in ms, `fallback` when absent, or null when the wait is too long to retry. */
function retryDelay(headers, fallback) {
  const raw = headers?.get?.("retry-after");
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds > 0) {
    if (seconds * 1000 > MAX_RETRY_DELAY_MS) return null;
    return seconds * 1000;
  }
  return fallback;
}

async function fetchPage(url, opts) {
  const tries = opts.pageTries ?? 2;
  let last = null;
  for (let i = 0; i < tries; i++) {
    const res = await request(url, { headers: PAGE_HEADERS, redirect: "follow" }, opts.timeoutMs, opts.fetchImpl);
    last = res;
    if (res.ok) return res;
    const retryable = res.status === 429 || res.status === 503;
    if (!retryable || i === tries - 1) return res;
    const delay = retryDelay(res.headers, opts.retryDelayMs * (i + 1));
    // A long `Retry-After` means a real block, not a burst: retrying only
    // extends it, so record the failure and move on.
    if (delay === null) return res;
    await opts.sleep(delay);
  }
  return last;
}

/**
 * Resolve a Google News article URL to the publisher URL.
 * @returns {Promise<{url: string, id: string|null, originalUrl: string|null,
 *   method: "batchexecute"|"protobuf"|"query-param"|null, error: string|null,
 *   attempts: Array<{method: string, ok: boolean, error: string|null}>}>}
 */
export async function resolveGoogleNews(url, opts = {}) {
  const options = {
    timeoutMs: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    retryDelayMs: opts.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS,
    pageTries: opts.pageTries ?? 2,
    sleep: opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms))),
    fetchImpl: opts.fetchImpl ?? globalThis.fetch,
  };

  const result = { url, id: googleNewsId(url), originalUrl: null, method: null, error: null, attempts: [] };

  // 0. explicit redirect parameter (old feeds still carry one)
  const fromQuery = queryParamUrl(url);
  if (fromQuery) {
    result.attempts.push(attempt("google-news-query", true));
    result.originalUrl = fromQuery;
    result.method = "query-param";
    return result;
  }

  // 1. offline protobuf decode (legacy ids only)
  if (result.id) {
    const decoded = decodeNewsId(result.id);
    if (decoded.url) {
      result.attempts.push(attempt("google-news-protobuf", true));
      result.originalUrl = decoded.url;
      result.method = "protobuf";
      return result;
    }
    result.attempts.push(
      attempt(
        "google-news-protobuf",
        false,
        decoded.opaque
          ? `opaque id token (${decoded.opaque}…): no publisher URL in the protobuf`
          : "id is not a decodable protobuf",
      ),
    );
  } else {
    result.attempts.push(attempt("google-news-protobuf", false, "no article id in the URL"));
  }

  if (!result.id) {
    result.error = "not a Google News article URL";
    return result;
  }

  // 2. article page tokens, then the internal RPC
  const origin = BASE;
  let tokens = null;
  const pageErrors = [];
  for (const path of PAGE_PATHS) {
    const pageUrl = `${origin}${path}${encodeURIComponent(result.id)}?oc=5`;
    const page = await fetchPage(pageUrl, options);
    if (!page.ok) {
      pageErrors.push(`${page.error} (${path})`);
      continue;
    }
    tokens = extractPageTokens(page.text);
    if (tokens) {
      result.attempts.push(attempt("google-news-page", true));
      break;
    }
    pageErrors.push(`no data-n-a-sg/ts in ${path} page`);
  }
  if (!tokens) {
    result.attempts.push(attempt("google-news-page", false, pageErrors.join("; ") || "page fetch failed"));
    result.error = pageErrors.join("; ") || "could not read Google News article page";
    return result;
  }

  const rpc = await request(
    RPC_ENDPOINT,
    {
      method: "POST",
      headers: {
        "User-Agent": BROWSER_UA,
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        Origin: origin,
        Referer: `${origin}/`,
      },
      body: buildBatchexecuteBody({ id: tokens.id, ts: tokens.ts, sg: tokens.sg, locale: localeFromUrl(url) }),
    },
    options.timeoutMs,
    options.fetchImpl,
  );
  if (!rpc.ok) {
    result.attempts.push(attempt("google-news-batchexecute", false, rpc.error ?? "RPC failed"));
    result.error = rpc.error ?? "RPC failed";
    return result;
  }

  const originalUrl = parseBatchexecuteResponse(rpc.text);
  if (!originalUrl) {
    result.attempts.push(attempt("google-news-batchexecute", false, "RPC returned no publisher URL"));
    result.error = "RPC returned no publisher URL (signature/timestamp rejected?)";
    return result;
  }

  result.attempts.push(attempt("google-news-batchexecute", true));
  result.originalUrl = originalUrl;
  result.method = "batchexecute";
  return result;
}

function parseArgs(argv) {
  const options = { url: null, out: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--url") options.url = argv[++i];
    else if (arg === "--out") options.out = argv[++i];
    else if (!options.url && !arg.startsWith("--")) options.url = arg;
  }
  return options;
}

export async function run(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (!options.url) {
    console.error("Usage: node <this-file> <google-news-url> [--out file.json]");
    process.exitCode = 1;
    return null;
  }
  const result = await resolveGoogleNews(options.url);
  const json = JSON.stringify(result, null, 2);
  if (options.out) {
    writeFileSync(resolve(options.out), json, "utf8");
    console.error(`Wrote ${options.out}`);
  } else {
    console.log(json);
  }
  console.error(
    `originalUrl=${result.originalUrl ?? "none"} method=${result.method ?? "none"} error=${result.error ?? "none"}`,
  );
  return result;
}

if (isEntryPoint(import.meta.url)) {
  await run();
}
