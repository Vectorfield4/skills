import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { canonicalizeUrl } from "#lib/article-search.mjs";
import { archiveFromDir, matchCandidate, parsePosts } from "#lib/content/utilities/article-archive.mjs";
import { field, listField, normalizeTitle, parseArticle, slugify } from "#lib/content/utilities/read-article.mjs";

const LIVE = [
  "---",
  'title: "AGCO and AgiBot agree on a joint pilot"',
  "slug: agco-agibot-pilot",
  'tags: ["AGCO", "AgiBot"]',
  "status: published",
  "source_url: https://news.example.com/agco-deal?utm_source=feed",
  "wp_id: 421",
  "---",
  "",
  "First paragraph.",
  "",
  "Second paragraph.",
].join("\n");

function frontmatterFile(lines, body) {
  return [...["---"], ...lines, "---", "", ...body].join("\n");
}

describe("parseArticle", () => {
  it("reads an inline JSON tag array, the live project format", () => {
    const article = parseArticle(LIVE);
    expect(article.title).toBe("AGCO and AgiBot agree on a joint pilot");
    expect(article.slug).toBe("agco-agibot-pilot");
    expect(article.tags).toEqual(["AGCO", "AgiBot"]);
    expect(article.status).toBe("published");
    expect(article.sourceUrl).toBe("https://news.example.com/agco-deal?utm_source=feed");
    expect(article.wpId).toBe(421);
    expect(article.draft).toBe(true);
  });

  it("keeps the body and the line it starts on", () => {
    const article = parseArticle(LIVE);
    expect(article.body).toBe("First paragraph.\n\nSecond paragraph.");
    expect(article.bodyLine).toBe(10);
    expect(article.frontmatter.split("\n")[0]).toBe('title: "AGCO and AgiBot agree on a joint pilot"');
  });

  it("reads a block list", () => {
    const text = frontmatterFile(["title: Block tags", "tags:", "  - AGCO", "  - AgiBot"], ["Body."]);
    expect(parseArticle(text).tags).toEqual(["AGCO", "AgiBot"]);
  });

  it("reads a comma string and a bare scalar", () => {
    expect(parseArticle(frontmatterFile(['tags: "AGCO, AgiBot"'], ["Body."])).tags).toEqual(["AGCO", "AgiBot"]);
    expect(parseArticle(frontmatterFile(["tags: AGCO"], ["Body."])).tags).toEqual(["AGCO"]);
  });

  it("reports no tags when the field is absent or empty", () => {
    expect(parseArticle(frontmatterFile(["title: No tags"], ["Body."])).tags).toEqual([]);
    expect(parseArticle(frontmatterFile(["tags:"], ["Body."])).tags).toEqual([]);
  });

  it("reads a file without frontmatter as plain body", () => {
    const text = "Just a paragraph.\n";
    const article = parseArticle(text);
    expect(article.frontmatter).toBe("");
    expect(article.fields).toEqual({});
    expect(article.body).toBe(text);
    expect(article.bodyLine).toBe(1);
    expect(article.title).toBe("");
    expect(article.slug).toBe("");
    expect(article.tags).toEqual([]);
    expect(article.status).toBe("");
    expect(article.sourceUrl).toBe("");
    expect(article.wpId).toBeNull();
    expect(article.wpUrl).toBe("");
    expect(article.draft).toBe(true);
  });

  it("reads CRLF input with a quoted title", () => {
    const text = [
      "---",
      'title: "CRLF title"',
      "tags:",
      "  - AGCO",
      "draft: false",
      "---",
      "",
      "Body.",
    ].join("\r\n");
    const article = parseArticle(text);
    expect(article.title).toBe("CRLF title");
    expect(article.tags).toEqual(["AGCO"]);
    expect(article.body).toBe("Body.");
    expect(article.bodyLine).toBe(8);
    expect(article.draft).toBe(false);
  });

  it("turns draft off only for an explicit false", () => {
    expect(parseArticle(frontmatterFile(["draft: false"], ["Body."])).draft).toBe(false);
    expect(parseArticle(frontmatterFile(["draft: false,"], ["Body."])).draft).toBe(false);
    expect(parseArticle(frontmatterFile(["draft: true"], ["Body."])).draft).toBe(true);
    expect(parseArticle(frontmatterFile(["draft: no"], ["Body."])).draft).toBe(true);
    expect(parseArticle(frontmatterFile(["title: x"], ["Body."])).draft).toBe(true);
  });

  it("parses wp_id as a number or null", () => {
    expect(parseArticle(frontmatterFile(["wp_id: 421"], ["Body."])).wpId).toBe(421);
    expect(parseArticle(frontmatterFile(["wp_id: abc"], ["Body."])).wpId).toBeNull();
    expect(parseArticle(frontmatterFile(["title: x"], ["Body."])).wpId).toBeNull();
  });

  it("reads wp_url and the camelCase sourceUrl alias", () => {
    const article = parseArticle(frontmatterFile(["sourceUrl: https://example.com/a", "wp_url: https://blog.example/a"], ["Body."]));
    expect(article.sourceUrl).toBe("https://example.com/a");
    expect(article.wpUrl).toBe("https://blog.example/a");
  });
});

describe("field helpers", () => {
  it("strips quotes and reports a missing key as null", () => {
    expect(field('title: "A: B"', "title")).toBe("A: B");
    expect(field("title: A", "missing")).toBeNull();
  });

  it("reads an inline list through listField", () => {
    expect(listField('tags: ["AGCO"]', "tags")).toEqual(["AGCO"]);
    expect(listField("title: A", "tags")).toEqual([]);
  });
});

describe("slugify", () => {
  it("keeps Cyrillic letters and joins runs with one dash", () => {
    expect(slugify("Промышленная робототехника 2026")).toBe("промышленная-робототехника-2026");
  });

  it("cuts a URL-ish string to a slug", () => {
    expect(slugify("https://www.example.com/news/AGCO-Deal?utm_source=x")).toBe(
      "https-www-example-com-news-agco-deal-utm-source-x",
    );
  });

  it("caps the length and never ends on a dash", () => {
    const slug = slugify("a".repeat(120));
    expect(slug).toHaveLength(80);
    expect(slug.endsWith("-")).toBe(false);
  });

  it("falls back when there is nothing to keep", () => {
    expect(slugify("")).toBe("article");
    expect(slugify("!!! ???")).toBe("article");
  });
});

describe("normalizeTitle", () => {
  it("collapses punctuation in Cyrillic", () => {
    expect(normalizeTitle("Промышленная, РОБОТОТЕХНИКА!")).toBe("промышленная робототехника");
  });

  it("collapses punctuation in a URL-ish string", () => {
    expect(normalizeTitle("https://Example.com/News/AGCO-Deal?x=1")).toBe("https example com news agco deal x 1");
  });
});

describe("archiveFromDir", () => {
  let dir;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "read-article-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("merges a ru/en pair into one entry", () => {
    const fields = [
      "slug: agco-deal",
      "status: published",
      "source_url: https://news.example.com/agco-deal?utm_source=rss",
    ];
    writeFileSync(
      join(dir, "agco-deal.ru.md"),
      frontmatterFile([...fields, 'title: "AGCO Deal"'], ["Русское тело."]),
      "utf8",
    );
    writeFileSync(
      join(dir, "agco-deal.en.md"),
      frontmatterFile([...fields, 'title: "AGCO Deal"'], ["English body."]),
      "utf8",
    );

    const archive = archiveFromDir(dir);
    expect([...archive.keys()]).toEqual(["agco-deal"]);

    const entry = archive.get("agco-deal");
    expect(entry.slug).toBe("agco-deal");
    expect(entry.files).toEqual(["agco-deal.en.md", "agco-deal.ru.md"]);
    expect(entry.sourceUrls.has(canonicalizeUrl("https://news.example.com/agco-deal"))).toBe(true);
    expect(entry.titles.has(normalizeTitle("AGCO Deal"))).toBe(true);
    expect([...entry.statuses]).toEqual(["published"]);
  });

  it("falls back to the file name when the field is absent", () => {
    writeFileSync(join(dir, "plain-note.ru.md"), frontmatterFile(["title: Plain note"], ["Body."]), "utf8");
    expect([...archiveFromDir(dir).keys()]).toEqual(["plain-note"]);
  });

  it("throws for a missing directory", () => {
    const missing = join(dir, "nope");
    expect(() => archiveFromDir(missing)).toThrow(`articles dir not found: ${missing}`);
  });
});

describe("parsePosts", () => {
  it("accepts a raw array and a posts envelope, canonicalizing what it gets", () => {
    const posts = parsePosts({
      posts: [{ slug: "a", title: "A Title", status: "draft", link: "https://x.example/a?utm_source=1" }],
    });
    expect(posts).toEqual([
      { slug: "a", title: "a title", status: "draft", urls: ["https://x.example/a"] },
    ]);
    expect(parsePosts([])).toEqual([]);
  });
});

describe("matchCandidate", () => {
  const archive = new Map([
    [
      "alpha",
      {
        slug: "alpha",
        files: ["alpha.ru.md"],
        sourceUrls: new Set([canonicalizeUrl("https://news.example.com/agco-deal")]),
        titles: new Set([normalizeTitle("AGCO Deal")]),
        statuses: new Set(["published"]),
      },
    ],
    [
      "beta",
      {
        slug: "beta",
        files: ["beta.ru.md"],
        sourceUrls: new Set(),
        titles: new Set([normalizeTitle("Other Story")]),
        statuses: new Set(["draft"]),
      },
    ],
  ]);

  it("prefers a source URL match", () => {
    const match = matchCandidate({ url: "https://news.example.com/agco-deal?utm_source=x", title: "Other Story" }, archive);
    expect(match).toEqual({ kind: "source_url", slug: "alpha", file: "alpha.ru.md", status: "published" });
  });

  it("prefers a slug match over a title match", () => {
    const match = matchCandidate({ url: "https://site.example/beta", title: "AGCO Deal" }, archive);
    expect(match).toEqual({ kind: "slug", slug: "beta", file: "beta.ru.md", status: "draft" });
  });

  it("matches a normalized title when url and slug miss", () => {
    const match = matchCandidate({ url: "https://site.example/unknown", title: "agco, deal!" }, archive);
    expect(match?.kind).toBe("title");
    expect(match?.slug).toBe("alpha");
  });

  it("returns null for a fresh candidate", () => {
    expect(matchCandidate({ url: "https://site.example/unknown", title: "Fresh Story" }, archive)).toBeNull();
  });

  it("matches WordPress posts by url, slug and title", () => {
    const posts = parsePosts([
      { slug: "wp-agco", title: "WP AGCO Deal", status: "publish", link: "https://blog.example/wp-agco" },
    ]);

    expect(matchCandidate({ url: "https://blog.example/wp-agco?utm_medium=x" }, archive, posts)).toEqual({
      kind: "wp_url",
      slug: "wp-agco",
      file: "",
      status: "publish",
    });
    expect(matchCandidate({ url: "https://other.example/wp-agco" }, archive, posts)?.kind).toBe("wp_slug");
    expect(matchCandidate({ title: "wp agco deal" }, archive, posts)?.kind).toBe("wp_title");
  });
});
