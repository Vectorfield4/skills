import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const SCAN = ["lib", "skills"];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (full.endsWith(".ps1") || full.endsWith(".sh")) out.push(full);
  }
  return out;
}

const wrappers = SCAN.flatMap((dir) => walk(path.join(ROOT, dir)));

describe("wrapper contracts", () => {
  it("every wrapper forwards to a sibling or repo engine", () => {
    expect(wrappers.length).toBeGreaterThan(0);
    for (const file of wrappers) {
      const text = readFileSync(file, "utf8");
      expect(text, file).toMatch(/exec node|& node|\$engine/);
      expect(text, file).not.toMatch(/\$env:USERPROFILE/);
      expect(text, file).not.toMatch(/C:\\\\/);
    }
  });

  it("every .sh wrapper invokes node with the engine path", () => {
    for (const file of wrappers.filter((f) => f.endsWith(".sh"))) {
      const text = readFileSync(file, "utf8");
      expect(text, file).toMatch(/exec node|node "\$/);
      expect(text, file).toMatch(/dirname/);
    }
  });

  it("every .ps1 wrapper forwards its arguments to node", () => {
    for (const file of wrappers.filter((f) => f.endsWith(".ps1"))) {
      const text = readFileSync(file, "utf8");
      expect(text, file).toMatch(/@args|@Rest|\$Rest|\$args|@nodeArgs/);
      expect(text, file).toMatch(/& node|node /);
    }
  });
});
