import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  addEntry,
  getEntry,
  KINDS,
  pendingSlugs,
  readQueue,
  removeEntry,
  setVisualConfig,
  targetPath,
  targetRel,
  updateEntry,
  writeQueue,
} from "../lib/generation-queue.mjs";

describe("generation queue", () => {
  let root;
  let file;

  const seed = (entries, text) => {
    mkdirSync(join(root, "content"), { recursive: true });
    writeFileSync(file, text ?? JSON.stringify(entries, null, 2), "utf8");
  };

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "queue-"));
    file = join(root, "content/generation-queue.json");
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("returns an empty list when the file is missing or empty", () => {
    expect(readQueue({ root })).toEqual([]);
    seed([], "   ");
    expect(readQueue({ root })).toEqual([]);
  });

  it("list paths are project relative and kind checked", () => {
    expect(KINDS).toEqual(["article", "service", "solution"]);
    expect(targetRel("article", "x", { root })).toBe("assets/images/articles/x.png");
    expect(targetPath("service", "y", { root })).toBe(
      join(root, "assets/images/services/y.png"),
    );
    expect(() => targetRel("nope", "x", { root })).toThrow(/unknown kind/);
  });

  it("adds a record, refuses a duplicate, and keeps the insertion order", () => {
    seed([]);
    addEntry({ kind: "article", slug: "a", title: "A", keywords: ["k"] }, { root });
    addEntry({ kind: "article", slug: "b", title: "B", keywords: [] }, { root });

    expect(readQueue({ root }).map((entry) => entry.slug)).toEqual(["a", "b"]);
    expect(() =>
      addEntry({ kind: "article", slug: "a", title: "again", keywords: [] }, { root }),
    ).toThrow(/already in the generation queue/);
  });

  it("requires a Latin object for a service or solution", () => {
    seed([]);
    expect(() => addEntry({ kind: "service", slug: "s", keywords: [] }, { root })).toThrow(
      /needs a non-empty Latin `object`/,
    );
    expect(() =>
      addEntry({ kind: "article", slug: "a", keywords: [] }, { root }),
    ).not.toThrow();
  });

  it("reads one record, lists pending slugs and removes a record", () => {
    seed([
      { kind: "article", slug: "a", title: "A", keywords: [] },
      { kind: "service", slug: "s", title: "S", keywords: [], object: "shop" },
    ]);

    expect(getEntry("service", "s", { root }).object).toBe("shop");
    expect(getEntry("article", "missing", { root })).toBeUndefined();
    expect(pendingSlugs(undefined, { root })).toEqual(["a", "s"]);
    expect(pendingSlugs("article", { root })).toEqual(["a"]);

    expect(removeEntry("article", "a", { root })).toBe(1);
    expect(removeEntry("article", "a", { root })).toBe(0);
    expect(readQueue({ root })).toHaveLength(1);
  });

  it("patches an existing record and refuses a missing one", () => {
    seed([{ kind: "article", slug: "a", title: "A", keywords: [] }]);
    expect(updateEntry("article", "a", { topic: "topic" }, { root }).topic).toBe("topic");
    expect(() => updateEntry("article", "missing", { topic: "x" }, { root })).toThrow(
      /no article entry/,
    );
  });

  it("runs the injected normalizer for visual_config only when given", () => {
    seed([{ kind: "article", slug: "a", title: "A", keywords: [] }]);
    const normalize = (slug, config) => ({ ...config, derived: slug });

    setVisualConfig("article", "a", { composition: undefined }, { root, normalize });
    expect(getEntry("article", "a", { root }).visual_config).toEqual({
      composition: undefined,
      derived: "a",
    });

    setVisualConfig("article", "a", { composition: "raw" }, { root });
    expect(getEntry("article", "a", { root }).visual_config).toEqual({ composition: "raw" });
  });

  it("preserves the line endings the file already uses", () => {
    const entries = [{ kind: "article", slug: "a", title: "A", keywords: [] }];
    seed(entries);
    writeQueue(entries, { root });
    expect(readFileSync(file, "utf8").includes("\r\n")).toBe(false);

    writeFileSync(file, `${JSON.stringify(entries, null, 2).replace(/\n/g, "\r\n")}\r\n`, "utf8");
    writeQueue(readQueue({ root }), { root });
    expect(readFileSync(file, "utf8").includes("\r\n")).toBe(true);
  });

  it("accepts custom queue paths and kind directories", () => {
    const custom = { root, file: "content/queue.json", kindDirs: { article: "img/a" } };
    expect(readQueue(custom)).toEqual([]);
    addEntry({ kind: "article", slug: "x", keywords: [] }, custom);
    expect(getEntry("article", "x", custom).slug).toBe("x");
    expect(targetRel("article", "x", custom)).toBe("img/a/x.png");
  });
});
