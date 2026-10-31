// The structural inventory reports facts about a tree: the contract it claims,
// the files it walked, the resolved edges and the violations it can prove. The
// fixture below carries one of each violation kind, plus a clean downward import
// that must stay unflagged.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { inventory } from "#lib/refactor/utilities/inventory.mjs";

const PROJECT = mkdtempSync(path.join(tmpdir(), "inventory-"));

const FILES = {
  "package.json": JSON.stringify({ name: "fixture", private: true }, null, 2),
  "AGENTS.md": [
    "# fixture",
    "",
    "Layers: app, pages, widgets, features, entities, shared.",
    "Levels: atoms, molecules, organisms.",
    "",
  ].join("\n"),
  "src/entities/z/index.ts": "export const z = 1;\n",
  "src/features/x/ui/atoms/A.tsx": 'import { z } from "@/entities/z";\n\nexport const A = z;\n',
  "src/features/x/ui/molecules/M.tsx": 'import { A } from "../atoms/A";\n\nexport const M = A;\n',
  "src/shared/widget.ts": 'import { A } from "@/features/x/ui/atoms/A";\n\nexport const w = A;\n',
  "src/utils/format.ts": "export const format = 1;\n",
};

function write(relative, content) {
  const file = path.join(PROJECT, relative);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content, "utf8");
}

const kindsAt = (report) =>
  report.violations.filter((violation) => violation.file === "").length === 0
    ? report.violations.map((violation) => `${violation.file}:${violation.line}:${violation.kind}`)
    : [];

beforeAll(() => {
  for (const [relative, content] of Object.entries(FILES)) write(relative, content);
});

afterAll(() => {
  rmSync(PROJECT, { recursive: true, force: true });
});

describe("inventory", () => {
  it("reads the contract from AGENTS.md", () => {
    const report = inventory(PROJECT);
    expect(report.ok).toBe(true);
    expect(report.error).toBeNull();
    expect(report.contract.source).toBe("AGENTS.md");
    expect(report.contract.layers).toEqual(["app", "pages", "widgets", "features", "entities", "shared"]);
    expect(report.contract.levels).toEqual(["atoms", "molecules", "organisms"]);
    expect(report.contract.alias).toBe("@/");
  });

  it("counts the walked files and their layers", () => {
    const report = inventory(PROJECT);
    expect(report.truncated).toBe(false);
    expect(report.stats.files).toBe(5);
    expect(report.stats.sourceFiles).toBe(5);
    expect(report.stats.byLayer).toEqual({ entities: 1, features: 2, shared: 1 });
    expect(report.stats.byLevel).toEqual({ atoms: 1, molecules: 1 });
  });

  it("resolves an aliased import to a project-relative file", () => {
    const report = inventory(PROJECT);
    expect(report.edges).toContainEqual({
      from: "src/features/x/ui/atoms/A.tsx",
      to: "src/entities/z/index.ts",
      spec: "@/entities/z",
    });
  });

  it("flags an upward import", () => {
    const report = inventory(PROJECT);
    const upward = report.violations.filter((violation) => violation.kind === "import-upward");
    expect(upward).toHaveLength(1);
    expect(upward[0].file).toBe("src/shared/widget.ts");
    expect(upward[0].line).toBe(1);
    expect(upward[0].detail).toContain("shared imports features");
  });

  it("flags a source file outside the layer contract", () => {
    const report = inventory(PROJECT);
    const outside = report.violations.filter((violation) => violation.kind === "file-outside-layer");
    expect(outside).toHaveLength(1);
    expect(outside[0].file).toBe("src/utils/format.ts");
    expect(outside[0].detail).toContain("utils is not a contract layer");
  });

  it("flags a level that imports another level of the same slice", () => {
    const report = inventory(PROJECT);
    const mismatch = report.violations.filter((violation) => violation.kind === "atomic-level-mismatch");
    expect(mismatch).toHaveLength(1);
    expect(mismatch[0].file).toBe("src/features/x/ui/molecules/M.tsx");
    expect(mismatch[0].line).toBe(1);
    expect(mismatch[0].detail).toBe('molecules imports atoms through "../atoms/A"');
  });

  it("leaves a clean downward import unflagged", () => {
    const report = inventory(PROJECT);
    const clean = report.violations.filter((violation) => violation.file === "src/features/x/ui/atoms/A.tsx");
    expect(clean).toEqual([]);
  });

  it("sorts violations by file, line and kind, so two runs agree", () => {
    const first = inventory(PROJECT);
    const second = inventory(PROJECT);
    expect(second.violations).toEqual(first.violations);

    const keys = first.violations.map((violation) => [violation.file, violation.line, violation.kind]);
    const sorted = [...keys].sort((a, b) => {
      if (a[0] !== b[0]) return a[0] < b[0] ? -1 : 1;
      if (a[1] !== b[1]) return a[1] - b[1];
      return a[2] < b[2] ? -1 : a[2] > b[2] ? 1 : 0;
    });
    expect(keys).toEqual(sorted);
    expect(kindsAt(first)).toHaveLength(3);
  });

  it("stops at --max-files and reports the walk as truncated", () => {
    expect(inventory(PROJECT, { maxFiles: 2 }).truncated).toBe(true);
    expect(inventory(PROJECT, { maxFiles: 2 }).stats.files).toBe(2);
    expect(inventory(PROJECT, { maxFiles: 100 }).truncated).toBe(false);
  });

  it("returns an error report for a path that is not a directory", () => {
    const missing = path.join(PROJECT, "src", "entities", "z", "index.ts");
    const report = inventory(missing);
    expect(report.ok).toBe(false);
    expect(report.error).toContain("is not a directory");
    expect(report.edges).toEqual([]);
    expect(report.violations).toEqual([]);
  });
});
