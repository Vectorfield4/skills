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

export function dedup(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = canonicalizeUrl(item.url);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function normalizeSources(json) {
  const list = Array.isArray(json) ? json : json?.sources;
  if (!Array.isArray(list)) throw new Error("Sources file must be an array or { sources: [...] }");
  return list.map((entry, index) => {
    if (!entry?.name || !entry?.url) {
      throw new Error(`Source #${index} is missing "name" or "url"`);
    }
    const type = entry.type ?? "rss";
    if (!["rss", "atom", "hn"].includes(type)) {
      throw new Error(`Source "${entry.name}" has unsupported type "${type}"`);
    }
    return {
      name: entry.name,
      url: entry.url,
      type,
      lang: entry.lang ?? null,
      country: entry.country ?? null,
      weight: entry.weight ?? 1.0,
    };
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