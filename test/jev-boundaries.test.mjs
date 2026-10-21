import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Transport guards for the Jev engine.
 *
 * The engine is Runware-only, so these tests pin the endpoint and keep a native
 * TypeSafe SDK from coming back.
 */

const ROOT = fileURLToPath(new URL("..", import.meta.url));

const CODE_EXT = new Set([".ts", ".tsx", ".mjs", ".js", ".jsx", ".cjs"]);
const SKIP_DIRS = new Set(["node_modules", "dist", ".git", "build", "coverage", ".cache"]);

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(join(dir, entry.name), out);
    } else if (CODE_EXT.has(entry.name.slice(entry.name.lastIndexOf(".")))) {
      out.push(join(dir, entry.name));
    }
  }
  return out;
}

const read = (file) => readFileSync(file, "utf8");

describe("jev: transport is Runware-only", () => {
  const client = read(join(ROOT, "lib", "jev", "client.mjs"));

  it("pins the model and endpoint", () => {
    expect(client).toContain("typesafe:jev@1");
    expect(client).toContain("https://api.runware.ai/v1/decisions");
  });

  it("carries no native TypeSafe endpoint or SDK", () => {
    for (const forbidden of ["api.typesafe.ai", "docs.typesafe.ai", "jev-latest", "@typesafe-ai"]) {
      expect(client, `${forbidden} in lib/jev/client.mjs`).not.toContain(forbidden);
    }
  });
});

describe("jev: no native transport in tooling code", () => {
  it("lib/ and skills carry no native TypeSafe endpoint, SDK or model alias", () => {
    const targets = [...walk(join(ROOT, "lib")), ...walk(join(ROOT, "skills"))];
    const offenders = [];
    for (const file of targets) {
      const text = read(file);
      for (const forbidden of [
        "api.typesafe.ai",
        "docs.typesafe.ai",
        "jev-latest",
        "@typesafe-ai",
      ]) {
        if (text.includes(forbidden)) offenders.push(`${file.slice(ROOT.length + 1)}: ${forbidden}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
