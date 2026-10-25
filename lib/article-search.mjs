// Shared primitives for thematic article search. No dependencies, no baked-in sources.

const NAMED_ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: "\u00a0",
};

export function decodeXmlEntities(text) {
  if (!text) return text;
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, body) => {
    if (body[0] === "#") {
      const codePoint =
        body[1].toLowerCase() === "x" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? match;
  });
}

function stripCdata(value) {
  const wrapped = value.match(/^<!\[CDATA\[([\s\S]*)\]\]>$/);
  return wrapped ? wrapped[1] : value;
}

function tag(block, name) {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"));
  if (!m) return undefined;
  return decodeXmlEntities(stripCdata(m[1])).trim() || undefined;
}

export function canonicalizeUrl(raw) {
  try {
    const u = new URL(raw);
    u.protocol = "https:";
    u.hash = "";
    for (const p of [...u.searchParams.keys()]) {
      if (/^utm_/i.test(p) || /^(fbclid|gclid|ref|source)$/i.test(p)) u.searchParams.delete(p);
    }
    let path = u.pathname.replace(/\/+$/, "");
    if (path === "") path = "/";
    u.pathname = path;
    return u.toString();
  } catch {
    return raw;
  }
}

export function parseRSS(xml, source) {
  const items = [];
  for (const m of xml.matchAll(/<item[\s\S]*?<\/item>/gi)) {
    const block = m[0];
    const title = tag(block, "title");
    const link = tag(block, "link") ?? tag(block, "guid");
    const date = tag(block, "pubDate") ?? tag(block, "dc:date");
    if (title && link) items.push({ source, title, url: canonicalizeUrl(link), date: date ?? null });
  }
  return items;
}

export function parseAtom(xml, source) {
  const items = [];
  for (const m of xml.matchAll(/<entry[\s\S]*?<\/entry>/gi)) {
    const block = m[0];
    const title = tag(block, "title");
    const link = block.match(/<link[^>]*href=["'](.*?)["']/i)?.[1]?.trim();
    const date = tag(block, "updated") ?? tag(block, "published");
    if (title && link) items.push({ source, title, url: canonicalizeUrl(link), date: date ?? null });
  }
  return items;
}

export function parseHackerNews(json, source) {
  return (json.hits ?? []).map((hit) => ({
    source,
    title: hit.title,
    url: canonicalizeUrl(hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`),
    date: hit.created_at ?? null,
  }));
}

const HTML_VOID_TAGS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

// Labels that carry no article information; when the visible text is one of
// these the parser falls back to aria-label / title / img alt.
const GENERIC_LINK_LABELS = new Set([
  "read more",
  "read article",
  "read the story",
  "learn more",
  "find out more",
  "more",
  "details",
  "view all",
  "see all",
  "next",
  "previous",
  "arrow",
  "arrow right",
  "icon",
  "image",
  "logo",
]);

// Icon and decorative alt text that must never become a headline.
const DECORATIVE_LABEL = /^(image|photo|picture|icon|arrow|logo|illustration)\b/i;

// Path segments that mark navigation pages rather than articles. Only used
// when a source has no selector, as a best-effort guard against nav links.
const NAV_PATH_SEGMENTS = new Set([
  "tag",
  "tags",
  "category",
  "categories",
  "author",
  "authors",
  "page",
  "search",
  "login",
  "account",
  "cart",
]);

function collapseText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function htmlFragmentToText(fragment) {
  return collapseText(decodeXmlEntities(String(fragment ?? "").replace(/<[^>]*>/g, " ")));
}

function parseTagAttributes(raw) {
  const attrs = {};
  for (const m of String(raw ?? "").matchAll(
    /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g,
  )) {
    const name = m[1].toLowerCase();
    if (name in attrs) continue;
    attrs[name] = decodeXmlEntities(m[2] ?? m[3] ?? m[4] ?? "");
  }
  return attrs;
}

/**
 * Scans HTML for `<a>` elements, keeping their attributes, inner HTML and
 * ancestor chain. Tolerant of unclosed tags; scripts, styles and comments are
 * dropped before scanning so their contents cannot produce phantom links.
 */
function collectHtmlAnchors(html) {
  const cleaned = String(html ?? "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|template|noscript)\b[\s\S]*?<\/\1\s*>/gi, "");
  const anchors = [];
  const stack = [];
  const open = [];
  const tagRe = /<(\/?)([a-zA-Z][\w:-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g;
  let match = tagRe.exec(cleaned);
  while (match) {
    const name = match[2].toLowerCase();
    if (match[1] === "/") {
      if (name === "a" && open.length > 0) {
        const node = open.pop();
        node.inner = cleaned.slice(node.contentStart, match.index);
        anchors.push(node);
      }
      const at = stack.findLastIndex((element) => element.name === name);
      if (at !== -1) stack.length = at;
    } else {
      const attrs = parseTagAttributes(match[3]);
      if (name === "a") {
        open.push({
          name,
          attrs,
          ancestors: stack.slice(),
          contentStart: tagRe.lastIndex,
          start: match.index,
        });
      }
      if (!HTML_VOID_TAGS.has(name) && !/\/\s*$/.test(match[3])) stack.push({ name, attrs });
    }
    match = tagRe.exec(cleaned);
  }
  for (const node of open) {
    node.inner = cleaned.slice(node.contentStart);
    anchors.push(node);
  }
  return anchors.sort((a, b) => a.start - b.start);
}

function parseAttributeTest(expression) {
  const m = String(expression).match(
    /^\s*([\w:-]+)\s*(?:([*^$~|]?=)\s*(?:"([^"]*)"|'([^']*)'|([^\]\s]*))\s*)?$/,
  );
  if (!m) return () => false;
  const name = m[1].toLowerCase();
  const operator = m[2];
  const expected = decodeXmlEntities(m[3] ?? m[4] ?? m[5] ?? "");
  return (node) => {
    const actual = node.attrs?.[name];
    if (actual === undefined) return false;
    switch (operator) {
      case undefined:
        return true;
      case "=":
        return actual === expected;
      case "*=":
        return actual.includes(expected);
      case "^=":
        return actual.startsWith(expected);
      case "$=":
        return actual.endsWith(expected);
      case "~=":
        return actual.split(/\s+/).includes(expected);
      case "|=":
        return actual === expected || actual.startsWith(`${expected}-`);
      default:
        return false;
    }
  };
}

/** Compiles one compound selector (tag, .class, #id, [attr...]) into a test. */
function parseCompoundSelector(token) {
  const tests = [];
  let index = 0;
  const tagMatch = /^(\*|[a-zA-Z][\w:-]*)/.exec(token);
  if (tagMatch) {
    const name = tagMatch[1].toLowerCase();
    if (name !== "*") tests.push((node) => node.name === name);
    index = tagMatch[0].length;
  }
  while (index < token.length) {
    const char = token[index];
    if (char === "." || char === "#") {
      const value = /^[\w-]+/.exec(token.slice(index + 1))?.[0];
      if (!value) {
        index += 1;
        continue;
      }
      if (char === ".") {
        tests.push((node) => (node.attrs?.class ?? "").split(/\s+/).includes(value));
      } else {
        tests.push((node) => node.attrs?.id === value);
      }
      index += 1 + value.length;
    } else if (char === "[") {
      const end = token.indexOf("]", index);
      if (end === -1) break;
      tests.push(parseAttributeTest(token.slice(index + 1, end)));
      index = end + 1;
    } else {
      index += 1;
    }
  }
  return (node) => tests.every((test) => test(node));
}

/**
 * Splits one selector group into compound tokens, remembering the combinator
 * that precedes each token. Quote-aware, so `[href*="a~b"]` stays one token.
 */
function splitSelectorGroup(group) {
  const tokens = [];
  let token = "";
  let combinator = null;
  let quote = null;
  const flush = () => {
    if (!token) return;
    tokens.push({ token, combinator });
    token = "";
    combinator = null;
  };
  for (const char of group) {
    if (quote) {
      token += char;
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      token += char;
      continue;
    }
    if (/\s/.test(char)) {
      flush();
      continue;
    }
    if (char === ">" || char === "+" || char === "~") {
      flush();
      combinator = char;
      continue;
    }
    token += char;
  }
  flush();
  return tokens;
}

/**
 * Compiles a CSS-like selector: comma-separated groups of compound selectors
 * joined by descendant (space) or child (`>`). Sibling combinators are treated
 * as descendants, which is conservative for link extraction.
 */
function parseSelector(selector) {
  return String(selector ?? "")
    .split(",")
    .map((group) => group.trim())
    .filter(Boolean)
    .map((group) =>
      splitSelectorGroup(group).map(({ token, combinator }) => ({
        test: parseCompoundSelector(token),
        child: combinator === ">",
      })),
    )
    .filter((steps) => steps.length > 0);
}

function matchesHtmlSelector(node, groups) {
  return groups.some((steps) => {
    const last = steps.length - 1;
    if (!steps[last].test(node)) return false;
    let parent = node.ancestors.length - 1;
    for (let step = last - 1; step >= 0; step--) {
      if (steps[step + 1].child) {
        if (parent < 0 || !steps[step].test(node.ancestors[parent])) return false;
        parent -= 1;
      } else {
        while (parent >= 0 && !steps[step].test(node.ancestors[parent])) parent -= 1;
        if (parent < 0) return false;
        parent -= 1;
      }
    }
    return true;
  });
}

function withinBase(url, base) {
  if (url.origin !== base.origin) return false;
  const basePath = base.pathname.replace(/\/+$/, "");
  if (basePath === "") return true;
  const path = url.pathname.replace(/\/+$/, "");
  return path === basePath || path.startsWith(`${basePath}/`);
}

function looksLikeArticlePath(url) {
  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length < 2) return false;
  return !segments.some((segment) => NAV_PATH_SEGMENTS.has(segment.toLowerCase()));
}

function cleanTitle(label) {
  return collapseText(
    String(label ?? "")
      // Some newsrooms append the publication date to the link text.
      .replace(/\s*\b\d{4}-\d{2}-\d{2}\b\s*/g, " ")
      .replace(/\s+([,.;:!?])/g, "$1"),
  );
}

/**
 * Picks the most informative label of an anchor. A heading inside the link is
 * the headline; raw inner text is next; aria-label, title and img alt are the
 * last resort and score lower so a headline wins when a card links the same
 * article twice (image link plus text link).
 */
function extractAnchorTitle(node) {
  // A <time> inside the link carries the date, not the headline.
  const withoutTime = String(node.inner ?? "").replace(/<time\b[^>]*>[\s\S]*?<\/time>/gi, " ");
  const heading = withoutTime.match(/<h[1-4]\b[^>]*>([\s\S]*?)<\/h[1-4]>/i)?.[1];
  const candidates = [
    { label: htmlFragmentToText(heading), score: 3 },
    { label: htmlFragmentToText(withoutTime), score: 2 },
    {
      label: htmlFragmentToText(
        String(withoutTime).match(/<img\b[^>]*\balt\s*=\s*["']([^"']*)["']/i)?.[1] ?? "",
      ),
      score: 1,
    },
    { label: node.attrs?.["aria-label"], score: 1 },
    { label: node.attrs?.title, score: 1 },
  ];
  for (const candidate of candidates) {
    const title = cleanTitle(candidate.label);
    if (!title) continue;
    if (GENERIC_LINK_LABELS.has(title.toLowerCase())) continue;
    if (DECORATIVE_LABEL.test(title)) continue;
    return { title, score: candidate.score };
  }
  return null;
}

function extractAnchorDate(node) {
  const inline = String(node.inner ?? "").match(
    /<time\b[^>]*\bdatetime\s*=\s*["']([^"']+)["']/i,
  )?.[1];
  const raw = inline ?? node.attrs?.["data-date"] ?? node.attrs?.datetime;
  if (!raw) return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/**
 * Extracts article links from a newsroom index page.
 *
 * `source.selector` is an optional CSS-like selector (`a[href*="/news/"]`,
 * `.news-list > a`). Without it every internal anchor with an article-shaped
 * path is kept. `source.baseUrl` narrows links to one path prefix; by default
 * the page origin is the boundary.
 */
export function parseHtmlList(html, source = {}) {
  const pageUrl = source.url ?? source.baseUrl;
  let page;
  try {
    page = new URL(pageUrl);
  } catch {
    throw new Error(`html-list source "${source.name ?? pageUrl}" needs an absolute url`);
  }
  const base = source.baseUrl ? new URL(source.baseUrl, page) : new URL(page.origin);
  const documentBase = (() => {
    const declared = String(html ?? "").match(/<base\b[^>]*\bhref\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!declared) return pageUrl;
    try {
      return new URL(decodeXmlEntities(declared), pageUrl).href;
    } catch {
      return pageUrl;
    }
  })();

  const groups = source.selector ? parseSelector(source.selector) : [];
  if (source.selector && groups.length === 0) {
    throw new Error(`html-list source "${source.name ?? pageUrl}" has an unusable selector`);
  }

  const pageKey = canonicalizeUrl(page.href);
  const byUrl = new Map();
  const items = [];
  for (const node of collectHtmlAnchors(html)) {
    const href = node.attrs?.href?.trim();
    if (!href || href.startsWith("#")) continue;
    if (/^(javascript|mailto|tel|data|file):/i.test(href)) continue;
    let url;
    try {
      url = new URL(href, documentBase);
    } catch {
      continue;
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") continue;
    url.hash = "";
    if (groups.length > 0 ? !matchesHtmlSelector(node, groups) : !looksLikeArticlePath(url)) continue;
    if (!withinBase(url, base)) continue;
    const key = canonicalizeUrl(url.href);
    if (key === pageKey) continue;
    const found = extractAnchorTitle(node);
    if (!found) continue;
    // One article is often linked several times (image, headline, "read more"
    // button). Keep the occurrence with the most informative label.
    const existing = byUrl.get(key);
    if (existing) {
      if (found.score > existing.score) {
        existing.item.title = found.title;
        existing.item.date = existing.item.date ?? extractAnchorDate(node);
        existing.score = found.score;
      }
      continue;
    }
    const item = {
      source: source.name,
      title: found.title,
      url: key,
      date: extractAnchorDate(node),
    };
    byUrl.set(key, { item, score: found.score });
    items.push(item);
  }
  return items;
}

/** Reads a dotted path (`news.items`) off plain JSON; a missing branch is undefined. */
function readJsonPath(value, path) {
  if (!path) return undefined;
  let current = value;
  for (const key of String(path).split(".")) {
    if (key === "") continue;
    if (current === null || typeof current !== "object") return undefined;
    current = current[key];
  }
  return current;
}

// Keys a client-rendered newsroom usually puts the article array under when the
// source declares no itemsPath.
const JSON_LIST_ROOT_KEYS = ["items", "data", "results"];

function jsonListEntries(json, source) {
  const path = source.itemsPath;
  const label = source.name ?? source.url ?? "json-list";
  if (path) {
    const found = readJsonPath(json, path);
    if (!Array.isArray(found)) {
      throw new Error(`json-list source "${label}" found no array at itemsPath "${path}"`);
    }
    return found;
  }
  if (Array.isArray(json)) return json;
  for (const key of JSON_LIST_ROOT_KEYS) {
    const found = json?.[key];
    if (Array.isArray(found)) return found;
  }
  throw new Error(`json-list source "${label}" returned no article array`);
}

function fillUrlTemplate(template, item) {
  return String(template).replace(/\{([\w.]+)\}/g, (token, path) => {
    const value = readJsonPath(item, path);
    if (value === undefined || value === null || value === "") return token;
    return encodeURIComponent(String(value));
  });
}

function jsonListDate(value) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "number") {
    const ms = value < 1e12 ? value * 1000 : value;
    return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
  }
  const text = String(value).trim();
  const ms = Date.parse(text);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : text;
}

/**
 * Extracts article links from a newsroom JSON endpoint.
 *
 * `source.itemsPath` locates the array (`news.items`); without it the root array
 * or a top-level `items`/`data`/`results` array is used. `titleField`,
 * `urlField` and `dateField` are dotted key names and default to `title`,
 * `url` and `date`. `urlTemplate` builds the URL from item fields when the
 * payload carries only an id and a slug (`/news/{id}/{newsUrlTitleSlug}`);
 * `baseUrl` resolves relative links and defaults to the endpoint origin.
 */
export function parseJsonList(json, source = {}) {
  const entries = jsonListEntries(json, source);
  const endpoint = source.url ?? source.baseUrl;
  let base;
  try {
    base = new URL(source.baseUrl ?? endpoint);
  } catch {
    throw new Error(`json-list source "${source.name ?? endpoint}" needs an absolute url`);
  }

  const titleField = source.titleField ?? "title";
  const urlField = source.urlField ?? "url";
  const dateField = source.dateField ?? "date";
  const items = [];
  const seen = new Set();
  for (const entry of entries) {
    if (entry === null || typeof entry !== "object") continue;
    const title = htmlFragmentToText(readJsonPath(entry, titleField));
    const raw = source.urlTemplate
      ? fillUrlTemplate(source.urlTemplate, entry)
      : readJsonPath(entry, urlField);
    if (!title || raw === undefined || raw === null || raw === "") continue;
    // A template with an unfilled token would mint a fake URL.
    if (/\{[\w.]+\}/.test(String(raw))) continue;
    let url;
    try {
      url = new URL(String(raw).trim(), base);
    } catch {
      continue;
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") continue;
    url.hash = "";
    const key = canonicalizeUrl(url.href);
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({
      source: source.name,
      title,
      url: key,
      date: jsonListDate(readJsonPath(entry, dateField)),
    });
  }
  return items;
}

export function dedup(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = canonicalizeUrl(item.url);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export const SOURCE_TYPES = ["rss", "atom", "hn", "html-list", "json-list"];

const JSON_LIST_METHODS = ["GET", "POST"];

/** Rejects a relative URL, naming the field that failed. */
function assertAbsoluteUrl(entry, field) {
  try {
    new URL(entry[field]);
  } catch {
    if (field === "baseUrl") {
      throw new Error(`Source "${entry.name}" has an invalid baseUrl "${entry[field]}"`);
    }
    throw new Error(`Source "${entry.name}" needs an absolute url`);
  }
}

function optionalString(entry, field, fallback = null) {
  const value = entry[field];
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Source "${entry.name}" has an invalid ${field}`);
  }
  return value.trim();
}

function normalizeJsonListSource(entry, source) {
  const name = entry.name;
  assertAbsoluteUrl(entry, "url");
  const method = String(entry.method ?? "GET").toUpperCase();
  if (!JSON_LIST_METHODS.includes(method)) {
    throw new Error(`Source "${name}" has unsupported method "${entry.method}"`);
  }
  let body = null;
  if (entry.body !== undefined && entry.body !== null) {
    if (typeof entry.body === "string") body = entry.body;
    else if (typeof entry.body === "object" && !Array.isArray(entry.body)) {
      // A JSON object body is a form map: `{ "count": 100 }` -> `count=100`.
      body = new URLSearchParams(
        Object.entries(entry.body).map(([key, value]) => [key, String(value)]),
      ).toString();
    } else {
      throw new Error(`Source "${name}" has an invalid body`);
    }
    if (body !== null && method !== "POST") {
      throw new Error(`Source "${name}" sends a body with method ${method}; use POST`);
    }
  }
  if (entry.baseUrl !== undefined && entry.baseUrl !== null) assertAbsoluteUrl(entry, "baseUrl");
  return {
    ...source,
    method,
    body,
    itemsPath: optionalString(entry, "itemsPath"),
    titleField: optionalString(entry, "titleField", "title"),
    urlField: optionalString(entry, "urlField", "url"),
    dateField: optionalString(entry, "dateField", "date"),
    urlTemplate: optionalString(entry, "urlTemplate"),
    baseUrl: entry.baseUrl ?? null,
  };
}

export function normalizeSources(json) {
  const list = Array.isArray(json) ? json : json?.sources;
  if (!Array.isArray(list)) throw new Error("Sources file must be an array or { sources: [...] }");
  return list.map((entry, index) => {
    if (!entry?.name || !entry?.url) {
      throw new Error(`Source #${index} is missing "name" or "url"`);
    }
    const type = entry.type ?? "rss";
    if (!SOURCE_TYPES.includes(type)) {
      throw new Error(`Source "${entry.name}" has unsupported type "${type}"`);
    }
    const source = {
      name: entry.name,
      url: entry.url,
      type,
      lang: entry.lang ?? null,
      country: entry.country ?? null,
      weight: entry.weight ?? 1.0,
    };
    if (type === "json-list") return normalizeJsonListSource(entry, source);
    if (type !== "html-list") return source;

    assertAbsoluteUrl(entry, "url");
    const selector =
      typeof entry.selector === "string" && entry.selector.trim() ? entry.selector.trim() : null;
    if (selector && parseSelector(selector).length === 0) {
      throw new Error(`Source "${entry.name}" has an unusable selector "${selector}"`);
    }
    if (entry.baseUrl !== undefined && entry.baseUrl !== null) assertAbsoluteUrl(entry, "baseUrl");
    return { ...source, selector, baseUrl: entry.baseUrl ?? null };
  });
}

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "the",
  "to",
  "with",
]);

export function topicKeywords(topic) {
  return String(topic ?? "")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .map((word) => word.trim())
    .filter((word) => word.length >= 2 && !STOP_WORDS.has(word));
}

export function matchesTopic(item, keywords) {
  const haystack = `${item?.title ?? ""} ${item?.body ?? ""}`.toLowerCase();
  return keywords.some((keyword) => haystack.includes(keyword));
}

export function filterByTopic(items, topic) {
  const keywords = topicKeywords(topic);
  if (keywords.length === 0) return [...items];
  return items.filter((item) => matchesTopic(item, keywords));
}

export function recencyFactor(date) {
  if (date == null) return 0.5;
  const ms = date instanceof Date ? date.getTime() : Date.parse(String(date));
  if (!Number.isFinite(ms)) return 0.5;
  const ageDays = (Date.now() - ms) / (1000 * 60 * 60 * 24);
  if (ageDays <= 7) return 1.0;
  if (ageDays <= 30) return 0.7;
  return 0.4;
}

export function attachSourceMeta(items, source) {
  const meta = {
    lang: source?.lang ?? null,
    country: source?.country ?? null,
    weight: source?.weight ?? 1.0,
  };
  return (items ?? []).map((item) => {
    const next = { ...item };
    if (next.lang === undefined) next.lang = meta.lang;
    if (next.country === undefined) next.country = meta.country;
    if (next.weight === undefined) next.weight = meta.weight;
    return next;
  });
}