import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { canonicalizeUrl } from "#lib/article-search.mjs";
import { archiveFromDir, matchCandidate } from "#lib/content/utilities/article-archive.mjs";
import { normalizeTitle } from "#lib/content/utilities/read-article.mjs";

function frontmatterFile(lines, body) {
  return [...["---"], ...lines, "---", "", ...body].join("\n");
}

describe("archiveFromDir", () => {
  let dir;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "published-check-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("merges a ru/en pair and records source_url", () => {
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

  it("throws for a missing directory", () => {
    const missing = join(dir, "nope");
    expect(() => archiveFromDir(missing)).toThrow(`articles dir not found: ${missing}`);
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
});
