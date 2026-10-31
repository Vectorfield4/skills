import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig, scan } from "../skills/devops/licensing/scripts/license.mjs";

const roots = [];

function project(files) {
  const root = mkdtempSync(join(tmpdir(), "login-ai-license-"));
  roots.push(root);
  for (const [path, content] of Object.entries(files)) {
    const full = join(root, path);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, content, "utf8");
  }
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("licensing", () => {
  it("passes a project that uses the Login AI License", () => {
    const root = project({
      "LICENSE": "Login AI License\n\nCopyright (c) 2026 Login AI.\n",
      "COPYRIGHT": "© 2026 Login AI\n",
      "README.md": "# Project\n\nLicense: Login AI License.\n",
      "package.json": JSON.stringify({ license: "SEE LICENSE IN LICENSE" }),
      ".login-ai-license.json": JSON.stringify({
        dataset: "src/data.json",
        stripItemFields: ["wikidata"],
      }),
      "src/data.json": JSON.stringify({
        source: { name: "Login AI", license: "Login AI License" },
        items: [{ code: "E100" }],
      }),
    });

    const report = scan(root, loadConfig(root));
    expect(report.ok).toBe(true);
    expect(report.errors).toEqual([]);
  });

  it("fails on a forbidden source and a stripped field", () => {
    const root = project({
      "LICENSE": "Login AI License\n\nCopyright (c) 2026 Login AI.\n",
      "README.md": "# Project\n\nLicense: Login AI License.\n",
      "package.json": JSON.stringify({ license: "SEE LICENSE IN LICENSE" }),
      ".login-ai-license.json": JSON.stringify({
        dataset: "src/data.json",
        stripItemFields: ["wikidata"],
      }),
      "src/data.json": JSON.stringify({
        source: { name: "Login AI", license: "Login AI License" },
        items: [{ code: "E100", wikidata: "Q1" }],
      }),
      "src/page.md": "Source: Open Food Facts\n",
    });

    const report = scan(root, loadConfig(root));
    expect(report.ok).toBe(false);
    expect(report.errors.some((error) => error.includes("Open Food Facts"))).toBe(true);
    expect(report.errors.some((error) => error.includes("wikidata"))).toBe(true);
  });
});
