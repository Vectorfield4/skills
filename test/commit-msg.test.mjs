import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  CONVENTIONAL_TYPES,
  firstMeaningfulLine,
  loadConvention,
  validateSubject,
} from "../lib/templates/commit-msg.mjs";

describe("firstMeaningfulLine", () => {
  it("skips comments and blank lines", () => {
    expect(firstMeaningfulLine("# comment\n\n  feat: x  \nbody")).toBe("feat: x");
  });

  it("returns an empty string for an empty message", () => {
    expect(firstMeaningfulLine("\n# only comments\n")).toBe("");
  });
});

describe("validateSubject", () => {
  const allowed = [...CONVENTIONAL_TYPES, "content"];

  it("accepts a conventional subject and a project prefix", () => {
    expect(validateSubject("feat(api)!: drop v1", allowed)).toBeNull();
    expect(validateSubject("content: new article", allowed)).toBeNull();
  });

  it("rejects an unknown prefix and names the accepted ones", () => {
    expect(validateSubject("content: x", CONVENTIONAL_TYPES)).toMatch(/unknown prefix "content"/);
    expect(validateSubject("updated the readme", allowed)).toMatch(/missing a `type: description`/);
  });

  it("lets merges, reverts and fixups through", () => {
    for (const subject of ["Merge branch 'main'", "Revert \"feat: x\"", "fixup! feat: x"]) {
      expect(validateSubject(subject, CONVENTIONAL_TYPES)).toBeNull();
    }
  });
});

describe("loadConvention", () => {
  it("falls back to the conventional set without a config", () => {
    const root = mkdtempSync(join(tmpdir(), "convention-"));
    expect(loadConvention(root)).toEqual(CONVENTIONAL_TYPES);
    rmSync(root, { recursive: true, force: true });
  });

  it("adds the prefixes declared in commit-convention.json", () => {
    const root = mkdtempSync(join(tmpdir(), "convention-"));
    writeFileSync(join(root, "commit-convention.json"), '{"types":{"design":"interface"}}');
    expect(loadConvention(root)).toContain("design");
    rmSync(root, { recursive: true, force: true });
  });

  it("survives a broken config", () => {
    const root = mkdtempSync(join(tmpdir(), "convention-"));
    writeFileSync(join(root, "commit-convention.json"), "{ not json");
    expect(loadConvention(root)).toEqual(CONVENTIONAL_TYPES);
    rmSync(root, { recursive: true, force: true });
  });
});
