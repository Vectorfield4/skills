// Parse capability catalog.
//
// The gap review must not propose a parser that the chain already has, so it
// scans the real scripts instead of guessing. Each failure reason declares what
// it needs (`covers`), and each cover is a probe over the source text. A cover is
// implemented when a scanned file matches the probe; the symbol that matched is
// the function to extend.
//
// Probes are source-level evidence, not a registry of intentions: a file that
// merely mentions `google-cache` in a recommendation does not pass.
//
// The discovery side has its own vocabulary (`SOURCE_VOCAB`): `html-list` and
// `json-list` are source types a fetcher accepts, not parse methods, so they are
// reported in `file.sources`, never in `file.methods`.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const PARSER_ROOTS = [
  { path: "skills/data", recursive: true },
  { path: "lib", recursive: false },
];

/** The repository that owns this lib; skills are mounted from here in projects. */
export function defaultRoot() {
  return resolve(dirname(fileURLToPath(import.meta.url)), "..");
}

const SKIP_DIRS = new Set(["node_modules", ".git", "generated", "docs"]);

// The catalog describes parsers, it is not one; scanning it would match its own
// probe literals and report every capability as implemented.
const SKIP_FILES = new Set(["lib/parse-catalog.mjs"]);

/** Method names the chain can report in `method` or in an `attempts[]` entry. */
const METHOD_VOCAB = new Set([
  "http-precheck",
  "readability",
  "raw-fetch",
  "ua-retry",
  "reader-proxy",
  "decode-redirect",
  "rss-source",
  "google-cache",
  "archive-org",
  "google-news",
  "json-ld",
  "headless",
  "pdf-extractor",
  "retry-later",
  "webfetch",
  "manual",
]);

/**
 * Source types a discovery script accepts. These are inputs (`sources.json`),
 * not fallback methods: `html-list` reads a server-rendered index page and
 * `json-list` reads the same list from a JSON endpoint.
 */
export const SOURCE_VOCAB = new Set(["rss", "atom", "hn", "html-list", "json-list"]);

/** One line per source type, so the catalog can explain what it recognized. */
export const SOURCES = {
  rss: "RSS 2.0 feed (`<item>` elements)",
  atom: "Atom feed (`<entry>` elements)",
  hn: "Hacker News Algolia search JSON (`hits[]`)",
  "html-list": "server-rendered newsroom index page read through a link `selector`",
  "json-list": "newsroom JSON endpoint that returns the article array",
};

export const CAPABILITIES = {
  "js-interstitial": {
    label: "JS shell / interstitial page",
    reliability: 3,
    covers: [
      {
        id: "decode-redirect",
        summary: "resolve the `url`/`q` redirect parameter to the publisher URL",
        probe: /searchParams\.get\(\s*["'](?:url|q)["']\s*\)|decodeURIComponent\s*\(/,
      },
      {
        id: "google-news-resolve",
        summary: "read the article page tokens and resolve the id through the DotsSplashUi RPC",
        probe: /google-news-batchexecute/,
      },
    ],
    extend:
      "pace Google's page/RPC calls: a flagged IP gets HTTP 429/503 for every news.google.com path, so add a cooldown between attempts and record the block instead of retrying immediately",
  },
  "waf-403": {
    label: "WAF 403 block",
    reliability: 2,
    covers: [
      {
        id: "ua-retry",
        summary: "refetch with a mobile Chrome / Googlebot User-Agent",
        probe: /MOBILE_CHROME_UA|GOOGLEBOT_UA|parseWithUA/,
      },
      {
        id: "reader-proxy",
        summary: "read the page through the reader proxy (r.jina.ai) when a UA swap is not enough",
        probe: /reader-proxy|fetchViaReader|READER_ENDPOINT/,
      },
    ],
    extend:
      "add standard `Accept`/`Accept-Language` headers next to the UA swap, then widen the reader-proxy step (it already covers a block the UA swap survives); captcha bypass stays out of scope",
  },
  "empty-or-js": {
    label: "empty body / JS-rendered page",
    reliability: 2,
    covers: [
      {
        id: "archive-org",
        summary: "read the archive.org snapshot",
        probe: /web\.archive\.org/,
      },
      { id: "json-ld", summary: "read the JSON-LD `articleBody`", probe: /articleBody/ },
      { id: "headless", summary: "render the page in a headless browser", probe: /\b(?:puppeteer|playwright)\b/i },
      {
        id: "reader-proxy",
        summary: "let the reader proxy render the page in its browser and return the markdown body",
        probe: /reader-proxy|fetchViaReader|READER_ENDPOINT/,
      },
    ],
    extend:
      "extract `articleBody` from JSON-LD, then one headless pass; the archive snapshot and the reader proxy are already wired",
  },
  "not-found": {
    label: "URL gone (404)",
    reliability: 0,
    disposition: "no-parser",
    covers: [],
    action: "No parser needed: drop the URL, the source moved or was removed",
  },
  "rate-limited": {
    label: "HTTP 429 / rate limit",
    reliability: 1,
    covers: [
      {
        id: "pacing",
        summary: "delay between batch requests",
        probe: /delayMs|--delay\b/,
      },
    ],
    extend:
      "replace the fixed pause with exponential backoff driven by `Retry-After` on HTTP 429",
  },
  "non-html": {
    label: "non-HTML payload (PDF/office)",
    reliability: 2,
    covers: [
      {
        id: "pdf-extractor",
        summary: "extract text from PDF/office documents",
        probe: /\b(?:pdf-parse|pdfjs-dist|pdftotext|pdfplumber)\b/,
      },
    ],
    build:
      "new document extractor: on `content-type: application/pdf` (and office) pull the text (`pdf-parse`/`pdftotext`) and return the same JSON shape as `article-extractor`",
  },
  timeout: {
    label: "fetch timeout",
    reliability: 1,
    covers: [
      {
        id: "timeout-budget",
        summary: "bounded fetch timeout",
        probe: /AbortSignal\.timeout/,
      },
    ],
    extend: "expose the timeout as `--timeout-ms` (it is a constant 20000 now) and retry once after an abort",
  },
  paywall: {
    label: "paywall / login wall",
    reliability: 0,
    disposition: "no-parser",
    covers: [],
    action: "No parser needed: keep the abstract/excerpt, never bypass the paywall",
  },
  unknown: {
    label: "unclassified failure",
    reliability: 1,
    covers: [],
    build:
      "a site-specific extractor after a manual inspection: pin the selector or endpoint in the source spec",
  },
};

/** Every declared function, exported or not. */
function declaredFunctions(source) {
  return [
    ...new Set(
      [...source.matchAll(/(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_$]+)\s*\(/g)].map((m) => m[1]),
    ),
  ];
}

/** Exported function names in a script. */
function exportedFunctions(source) {
  return [
    ...new Set(
      [...source.matchAll(/export\s+(?:async\s+)?function\s+([A-Za-z0-9_$]+)/g)].map((m) => m[1]),
    ),
  ];
}

/** Dash-case string literals that name a chain method. */
function methodLiterals(source) {
  const found = [...source.matchAll(/["'`]([a-z][a-z0-9]*(?:-[a-z0-9]+)+)["'`]/g)].map((m) => m[1]);
  return [...new Set(found)].filter((token) => METHOD_VOCAB.has(token));
}

/** Source types a script declares it can consume. */
function sourceLiterals(source) {
  const found = new Set();
  // Dash-case types are unambiguous as literals.
  for (const m of source.matchAll(/["'`]([a-z][a-z0-9]*(?:-[a-z0-9]+)+)["'`]/g)) {
    if (SOURCE_VOCAB.has(m[1])) found.add(m[1]);
  }
  // Feed types are single words that also appear in prose and variable names,
  // so they count only when declared: a `type` comparison or SOURCE_TYPES.
  for (const m of source.matchAll(/\btype\s*(?:===?|!==?|:|=)\s*["']([a-z-]+)["']/g)) {
    if (SOURCE_VOCAB.has(m[1])) found.add(m[1]);
  }
  const list = /SOURCE_TYPES\s*=\s*\[([^\]]*)\]/.exec(source);
  if (list) {
    for (const m of list[1].matchAll(/["']([a-z-]+)["']/g)) {
      if (SOURCE_VOCAB.has(m[1])) found.add(m[1]);
    }
  }
  return [...found];
}

/** Body of one function, without its signature, up to the next declaration. */
function bodyOf(source, name) {
  const pattern = new RegExp(`(?:export\\s+)?(?:async\\s+)?function\\s+${name}\\s*\\(`);
  const match = pattern.exec(source);
  if (!match) return null;
  const afterHeader = match.index + match[0].length;
  // Start after the signature so a function does not match its own name.
  const lineEnd = source.indexOf("\n", afterHeader);
  const brace = source.lastIndexOf("{", lineEnd === -1 ? source.length : lineEnd);
  const start = brace === -1 ? afterHeader : brace;
  const rest = source.slice(afterHeader).search(/\n(?:export\s+)?(?:async\s+)?function\s+/);
  const end = rest === -1 ? source.length : afterHeader + rest;
  return source.slice(start, end);
}

/** How often a probe fires inside a function body; the best owner wins. */
function probeHits(probe, body) {
  const flags = probe.flags.includes("g") ? probe.flags : `${probe.flags}g`;
  return [...String(body ?? "").matchAll(new RegExp(probe.source, flags))].length;
}

function describeFile(root, file) {
  const source = readFileSync(file, "utf8");
  const rel = relative(root, file).split(sep).join("/");
  const functions = exportedFunctions(source);
  const symbols = declaredFunctions(source);

  const capabilities = [];
  for (const [reason, def] of Object.entries(CAPABILITIES)) {
    for (const cover of def.covers ?? []) {
      if (!cover.probe.test(source)) continue;
      // Name the function that actually holds the implementation; do not guess.
      // The best owner is the one with the most probe hits, so a JSDoc note for
      // the next function cannot claim a capability from the one before it.
      const best = symbols
        .map((name) => ({ name, hits: probeHits(cover.probe, bodyOf(source, name)) }))
        .filter((entry) => entry.hits > 0)
        .sort((a, b) => b.hits - a.hits)[0];
      capabilities.push({ reason, id: cover.id, symbol: best?.name ?? null });
    }
  }

  return {
    file: rel,
    skill: rel.startsWith("skills/") ? (rel.split("/")[2] ?? null) : "lib",
    functions,
    methods: methodLiterals(source),
    sources: sourceLiterals(source),
    capabilities,
  };
}

function collect(dir, out = [], recursive = true) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = resolve(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (recursive) collect(full, out, recursive);
    } else if (full.endsWith(".mjs")) {
      out.push(full);
    }
  }
  return out;
}

/** Scan the skill scripts and the shared lib for parse implementations. */
export function scanParsers(root = defaultRoot(), roots = PARSER_ROOTS) {
  const files = [];
  for (const spec of roots) {
    const relRoot = typeof spec === "string" ? spec : spec.path;
    const recursive = typeof spec === "string" ? true : spec.recursive !== false;
    let entries;
    try {
      entries = collect(resolve(root, relRoot), [], recursive);
    } catch {
      continue; // a project checkout without the skills tree
    }
    for (const file of entries) files.push(describeFile(root, file));
  }
  const considered = files.filter((file) => !SKIP_FILES.has(file.file));
  considered.sort((a, b) => a.file.localeCompare(b.file));
  return { root, files: considered };
}

function rank(file) {
  // Prefer a skill script over lib, and a script that exports something.
  return (file.skill === "lib" ? 0 : 2) + (file.functions.length > 0 ? 1 : 0);
}

/** Which covers of `reason` the scanned files already implement. */
export function coverage(reason, catalog) {
  const def = CAPABILITIES[reason] ?? CAPABILITIES.unknown;
  const covers = (def.covers ?? []).map((cover) => {
    const hits = catalog.files
      .filter((file) => file.capabilities.some((c) => c.id === cover.id))
      .sort((a, b) => rank(b) - rank(a) || a.file.localeCompare(b.file));
    const hit = hits[0];
    return {
      id: cover.id,
      summary: cover.summary,
      implemented: Boolean(hit),
      file: hit?.file ?? null,
      function: hit?.capabilities.find((c) => c.id === cover.id)?.symbol ?? null,
    };
  });
  return {
    covers,
    implemented: covers.length > 0 && covers.every((c) => c.implemented),
    coveredBy: covers.filter((c) => c.implemented),
    uncovered: covers.filter((c) => !c.implemented),
  };
}

function label(file, fn) {
  return `\`${file}\` → \`${fn ?? "module-level"}\``;
}

function actionFor(def, cov) {
  if (def.disposition === "no-parser") return def.action;
  if (cov.implemented) {
    const first = cov.coveredBy[0];
    return `Extend the existing parser ${label(first.file, first.function)}: ${def.extend ?? "widen it to the new case"}`;
  }
  if (cov.coveredBy.length > 0) {
    const where = cov.coveredBy.map((c) => `${label(c.file, c.function)} (${c.id})`).join(", ");
    const missing = cov.uncovered.map((c) => c.summary).join("; ");
    return `Extend the existing parser ${where}: add ${missing}`;
  }
  return `New parser: ${def.build ?? "add a site-specific extractor after a manual inspection"}`;
}

/** Which scanned files accept each discovery source type. */
export function sourceSupport(catalog) {
  const support = {};
  for (const type of SOURCE_VOCAB) support[type] = [];
  for (const file of catalog.files) {
    for (const type of file.sources ?? []) {
      support[type]?.push({ file: file.file, summary: SOURCES[type] });
    }
  }
  return support;
}

/**
 * The backlog entry for one failure reason. `alreadyImplemented` is true only
 * when every cover the reason needs is already in the chain.
 */
export function proposalFor(reason, catalog) {
  const key = CAPABILITIES[reason] ? reason : "unknown";
  const def = CAPABILITIES[key];
  const cov = coverage(key, catalog);
  const disposition = def.disposition ?? (cov.implemented ? "extend" : "build");
  return {
    reason: key,
    capability: def.label,
    disposition,
    alreadyImplemented: cov.implemented,
    coveredBy: cov.coveredBy.map((c) => ({
      file: c.file,
      function: c.function,
      capability: c.id,
      summary: c.summary,
    })),
    uncovered: cov.uncovered.map((c) => ({ capability: c.id, summary: c.summary })),
    action: actionFor(def, cov),
  };
}
