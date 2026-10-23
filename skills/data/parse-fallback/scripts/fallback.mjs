#!/usr/bin/env node
// parse-fallback: resolve a Google News id to the publisher URL, then try
// alternate UA, Google cache, archive.org, RSS source URL when the base parse
// fails. Never invents content.

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { JSDOM, VirtualConsole } from "jsdom";
import { Readability } from "@mozilla/readability";
import { isEntryPoint } from "#lib/cli.mjs";
import { BROWSER_UA } from "#lib/http.mjs";
import { parse as tryParse } from "../../try-parse-url/scripts/parse.mjs";
import { isGoogleNewsUrl, resolveGoogleNews } from "./google-news.mjs";
import { readerFetch } from "./reader-fetch.mjs";

const MOBILE_CHROME_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const GOOGLEBOT_UA =
  "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";

function wordCount(text) {
  return String(text ?? "").trim().split(/\s+/).filter(Boolean).length;
}

function baseResult(url) {
  return {
    url,
    status: "failed",
    method: "none",
    title: null,
    byline: null,
    excerpt: null,
    textContent: null,
    wordCount: 0,
    siteName: null,
    httpStatus: null,
    contentType: null,
    error: null,
    fallback: "none",
    resolvedUrl: null,
    resolvedBy: null,
    attempts: [],
  };
}

function finalize(url, parsed, method, attempts, extra = {}) {
  return {
    url,
    status: "ok",
    method,
    title: parsed.title ?? null,
    byline: parsed.byline ?? null,
    excerpt: parsed.excerpt ?? null,
    textContent: parsed.textContent ?? null,
    wordCount: parsed.wordCount ?? 0,
    siteName: parsed.siteName ?? null,
    httpStatus: parsed.httpStatus ?? 200,
    contentType: parsed.contentType ?? null,
    error: null,
    fallback: "none",
    ...extra,
    attempts,
  };
}

async function fetchHtml(url, ua) {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": ua },
      redirect: "follow",
      signal: AbortSignal.timeout(20000),
    });
    const httpStatus = res.status;
    const contentType = res.headers.get("content-type");
    if (!res.ok) return { ok: false, httpStatus, contentType, error: `HTTP ${httpStatus}` };
    const html = await res.text();
    return { ok: true, httpStatus, contentType, html };
  } catch (e) {
    return { ok: false, httpStatus: null, contentType: null, error: `fetch error: ${e.message}` };
  }
}

const JUNK_MARKERS = [
  "Please Don't Scroll Past This",
  "chip in?",
  "Wayback Machine is fighting",
  "did not match any documents",
  "enable JavaScript",
  "data-n-a-sg",
  "batchexecute",
];

function isJunk(text, title) {
  const blob = `${title ?? ""}\n${text ?? ""}`;
  return JUNK_MARKERS.some((m) => blob.toLowerCase().includes(m.toLowerCase()));
}

async function readArticle(url, html, minWords) {
  try {
    const dom = new JSDOM(html, { url, virtualConsole: new VirtualConsole() });
    const article = new Readability(dom.window.document).parse();
    if (!article) return { ok: false, error: "Readability returned null" };
    const wc = wordCount(article.textContent);
    if (wc < minWords) {
      return { ok: false, error: `Readability body too short (${wc} words < ${minWords})` };
    }
    if (isJunk(article.textContent, article.title)) {
      return { ok: false, error: "interstitial/junk page detected" };
    }
    return {
      ok: true,
      title: article.title ?? null,
      byline: article.byline ?? null,
      excerpt: article.excerpt ?? null,
      textContent: article.textContent ?? null,
      wordCount: wc,
      siteName: article.siteName ?? null,
    };
  } catch (e) {
    return { ok: false, error: `extract error: ${e.message}` };
  }
}

async function parseWithUA(url, ua, minWords) {
  const fetched = await fetchHtml(url, ua);
  if (!fetched.ok) return fetched;
  const art = await readArticle(url, fetched.html, minWords);
  if (!art.ok) return { ok: false, httpStatus: fetched.httpStatus, contentType: fetched.contentType, error: art.error };
  return {
    ok: true,
    httpStatus: fetched.httpStatus,
    contentType: fetched.contentType,
    ...art,
  };
}

function parseArgs(argv) {
  const options = {
    url: null,
    originalSourceUrl: null,
    feedUrl: null,
    out: null,
    slug: null,
    minWords: 80,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--url") options.url = argv[++i];
    else if (arg === "--original-source" || arg === "--originalSourceUrl") options.originalSourceUrl = argv[++i];
    else if (arg === "--feed-url" || arg === "--feedUrl") options.feedUrl = argv[++i];
    else if (arg === "--out") options.out = argv[++i];
    else if (arg === "--slug") options.slug = argv[++i];
    else if (arg === "--min-words") options.minWords = Number(argv[++i]) || 80;
    else if (!options.url && !arg.startsWith("--")) options.url = arg;
  }
  return options;
}

function attempt(method, ok, error = null) {
  return { method, ok: Boolean(ok), error: ok ? null : (error ?? "failed") };
}

export async function fallback(url, opts = {}) {
  const minWords = opts.minWords ?? 80;
  const originalSourceUrl = opts.originalSourceUrl ?? opts.originalSource ?? null;
  const feedUrl = opts.feedUrl ?? null;

  const result = baseResult(url);
  const attempts = result.attempts;
  const googleNews = isGoogleNewsUrl(url);
  // Google News links are a JS shell on the article page itself; the chain
  // works on the publisher URL the resolver returns instead.
  let target = url;

  // 0. try the base parser first (never for a Google News article URL)
  let first = null;
  if (!googleNews) {
    try {
      first = await tryParse(url, minWords);
    } catch (e) {
      first = { status: "failed", error: `parse error: ${e.message}`, httpStatus: null, contentType: null, attempts: [] };
    }
    if (Array.isArray(first?.attempts) && first.attempts.length > 0) {
      attempts.push(...first.attempts);
    } else if (first) {
      const method = first.method && first.method !== "none" ? first.method : "http-precheck";
      attempts.push(attempt(method, first.status === "ok", first.error ?? "failed"));
    }
    if (first && first.status === "ok") return { ...first, resolvedUrl: null, resolvedBy: null };
    if (first) {
      result.httpStatus = first.httpStatus ?? result.httpStatus;
      result.contentType = first.contentType ?? result.contentType;
      result.error = first.error ?? result.error;
    }
  }

  // 0b. resolve a Google News article URL to the publisher, then parse it
  if (googleNews) {
    let resolved = null;
    try {
      resolved = await resolveGoogleNews(url, {
        timeoutMs: opts.timeoutMs,
        retryDelayMs: opts.retryDelayMs,
        pageTries: opts.pageTries,
        sleep: opts.sleep,
        fetchImpl: opts.fetchImpl,
      });
    } catch (e) {
      attempts.push(attempt("google-news-resolve", false, `resolver error: ${e.message}`));
      result.error = `resolver error: ${e.message}`;
    }
    if (resolved) {
      attempts.push(...resolved.attempts);
      if (resolved.originalUrl) {
        result.resolvedUrl = resolved.originalUrl;
        result.resolvedBy = resolved.method;
        target = resolved.originalUrl;
        const parsed = await tryParse(target, minWords);
        if (Array.isArray(parsed?.attempts) && parsed.attempts.length > 0) {
          attempts.push(...parsed.attempts);
        } else if (parsed) {
          attempts.push(attempt(parsed.method ?? "http-precheck", parsed.status === "ok", parsed.error ?? "failed"));
        }
        if (parsed && parsed.status === "ok") {
          return { ...parsed, url, method: "google-news", attempts, resolvedUrl: target, resolvedBy: resolved.method };
        }
        result.error = parsed?.error ?? result.error;
        result.httpStatus = parsed?.httpStatus ?? result.httpStatus;
        result.contentType = parsed?.contentType ?? result.contentType;
      } else {
        result.error = resolved.error ?? result.error;
      }
    }
  }

  const tried = new Set();

  // 1. ua-retry
  for (const ua of [MOBILE_CHROME_UA, GOOGLEBOT_UA]) {
    const r = await parseWithUA(target, ua, minWords);
    const label = ua === MOBILE_CHROME_UA ? "mobile Chrome" : "Googlebot";
    attempts.push(attempt("ua-retry", r.ok, r.ok ? null : `${r.error ?? "failed"} (UA: ${label})`));
    if (r.ok) {
      return finalize(url, r, googleNews ? "google-news" : "ua-retry", attempts, {
        resolvedUrl: result.resolvedUrl,
        resolvedBy: result.resolvedBy,
      });
    }
    result.error = r.error ?? result.error;
    result.httpStatus = r.httpStatus ?? result.httpStatus;
    result.contentType = r.contentType ?? result.contentType;
  }

  // 1b. reader-proxy: a real browser fetches the page the UA swap could not.
  // Google News is skipped: the proxy domain is blocked for it.
  if (!googleNews) {
    const r = await readerFetch(target, { minWords });
    attempts.push(...(r.attempts ?? [attempt("reader-proxy", r.status === "ok", r.error)]));
    if (r.status === "ok") {
      return finalize(url, r, "reader-proxy", attempts, {
        resolvedUrl: result.resolvedUrl,
        resolvedBy: result.resolvedBy,
      });
    }
    result.error = r.error ?? result.error;
    result.httpStatus = r.httpStatus ?? result.httpStatus;
    result.contentType = r.contentType ?? result.contentType;
  }

  // 2. Google News redirect decode
  let decodedOriginal = null;
  try {
    const u = new URL(url);
    decodedOriginal = u.searchParams.get("url") || u.searchParams.get("q");
    if (decodedOriginal) decodedOriginal = decodeURIComponent(decodedOriginal);
  } catch {}
  if (!decodedOriginal && /news\.google\.com/i.test(url) && originalSourceUrl) {
    decodedOriginal = originalSourceUrl;
  }
  attempts.push(
    attempt(
      "decode-redirect",
      Boolean(decodedOriginal),
      decodedOriginal ? null : "no `url`/`q` redirect parameter and no --original-source",
    ),
  );

  // 3. rss-source: parse the resolved or supplied original URL
  const originalCandidates = [];
  if (decodedOriginal && /^https?:\/\//.test(decodedOriginal)) originalCandidates.push(decodedOriginal);
  if (originalSourceUrl && /^https?:\/\//.test(originalSourceUrl) && originalSourceUrl !== decodedOriginal) {
    originalCandidates.push(originalSourceUrl);
  }

  for (const cand of originalCandidates) {
    if (tried.has(cand)) continue;
    tried.add(cand);
    try {
      const r = await tryParse(cand, minWords);
      attempts.push(attempt("rss-source", r?.status === "ok", r?.error ?? `no body at ${cand}`));
      if (r && r.status === "ok") {
        const method = cand === originalSourceUrl ? "rss-source" : "decode-redirect";
        return { ...r, url, method, attempts, resolvedUrl: result.resolvedUrl, resolvedBy: result.resolvedBy };
      }
      result.error = (r && r.error) || result.error;
    } catch (e) {
      attempts.push(attempt("rss-source", false, `parse error: ${e.message}`));
      result.error = `parse error: ${e.message}`;
    }
  }

  // 4. google-cache
  const cacheUrl = `https://webcache.googleusercontent.com/search?q=cache:${encodeURIComponent(target)}`;
  if (!tried.has(cacheUrl)) {
    tried.add(cacheUrl);
    const r = await parseWithUA(cacheUrl, BROWSER_UA, minWords);
    attempts.push(attempt("google-cache", r.ok, r.ok ? null : (r.error ?? "failed")));
    if (r.ok) {
      return finalize(url, r, "google-cache", attempts, {
        resolvedUrl: result.resolvedUrl,
        resolvedBy: result.resolvedBy,
      });
    }
    result.error = r.error ?? result.error;
    result.httpStatus = r.httpStatus ?? result.httpStatus;
    result.contentType = r.contentType ?? result.contentType;
  }

  // 5. archive.org
  const archiveUrl = `https://web.archive.org/web/*/${target}`;
  if (!tried.has(archiveUrl)) {
    tried.add(archiveUrl);
    const r = await parseWithUA(archiveUrl, BROWSER_UA, minWords);
    attempts.push(attempt("archive-org", r.ok, r.ok ? null : (r.error ?? "failed")));
    if (r.ok) {
      return finalize(url, r, "archive-org", attempts, {
        resolvedUrl: result.resolvedUrl,
        resolvedBy: result.resolvedBy,
      });
    }
    result.error = r.error ?? result.error;
    result.httpStatus = r.httpStatus ?? result.httpStatus;
    result.contentType = r.contentType ?? result.contentType;
  }

  // final failure
  result.status = "failed";
  result.method = "none";
  result.fallback = "manual";
  if (!result.error) result.error = "all fallbacks failed";
  return result;
}

export async function run(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (!options.url) {
    console.error(
      "Usage: node <this-file> <url> [--original-source <url>] [--feed-url <url>] [--out file.json] [--slug slug] [--min-words N]",
    );
    process.exitCode = 1;
    return null;
  }

  const result = await fallback(options.url, {
    originalSourceUrl: options.originalSourceUrl,
    feedUrl: options.feedUrl,
    minWords: options.minWords,
  });

  const json = JSON.stringify(result, null, 2);

  let outPath = options.out;
  if (!outPath && options.slug) {
    outPath = resolve("docs", "research", `${options.slug}.parsed.json`);
  }
  if (outPath) {
    writeFileSync(resolve(outPath), json, "utf8");
    console.error(`Wrote fallback result to ${outPath}`);
  } else {
    console.log(json);
  }
  console.error(`status=${result.status} method=${result.method} words=${result.wordCount} fallback=${result.fallback}`);
  return result;
}

if (isEntryPoint(import.meta.url)) {
  await run();
}
