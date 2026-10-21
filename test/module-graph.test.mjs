import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SCANNED = ["skills", "lib"];
const EXTERNAL = ["jsdom", "@mozilla/readability"];

const manifest = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8"));
const importsMap = manifest.imports ?? {};

/** Every `.mjs` under the scanned roots, including the skill scripts. */
function collect(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) collect(full, out);
    else if (full.endsWith(".mjs")) out.push(full);
  }
  return out;
}

/** The file a specifier points at, or null when it is not a file import. */
function resolve(spec, from) {
  if (spec.startsWith("node:") || EXTERNAL.includes(spec)) return null;
  for (const [key, target] of Object.entries(importsMap)) {
    const prefix = key.replace(/\*$/, "");
    if (spec.startsWith(prefix) && key.endsWith("*")) {
      return path.join(ROOT, target.replace(/\*$/, ""), spec.slice(prefix.length));
    }
  }
  return spec.startsWith(".") ? path.resolve(path.dirname(from), spec) : null;
}

const files = SCANNED.flatMap((dir) => collect(path.join(ROOT, dir)));
const imports = files.flatMap((file) =>
  [...readFileSync(file, "utf8").matchAll(/from\s+"([^"]+)"/g)].map((match) => ({
    file,
    spec: match[1],
  })),
);

describe("module graph", () => {
  it("resolves every relative and #lib import", () => {
    const broken = imports
      .map(({ file, spec }) => ({ file, spec, target: resolve(spec, file) }))
      .filter(({ target }) => target !== null && !existsSync(target))
      .map(({ file, spec }) => `${path.relative(ROOT, file)} -> ${spec}`);
    expect(broken).toEqual([]);
  });

  it("keeps skill scripts on #lib instead of a relative climb or an npm name", () => {
    const offenders = imports
      .filter(({ file }) => file.includes(`${path.sep}skills${path.sep}`))
      .filter(({ spec }) => /(\.\.\/)+lib\//.test(spec) || (spec.startsWith("@") && !EXTERNAL.includes(spec)))
      .map(({ file, spec }) => `${path.relative(ROOT, file)} -> ${spec}`);
    expect(offenders).toEqual([]);
  });

  it("keeps the jev and prose libs inside this repository", () => {
    expect(existsSync(path.join(ROOT, "lib", "jev", "cli.mjs"))).toBe(true);
    expect(existsSync(path.join(ROOT, "lib", "prose", "prompts.mjs"))).toBe(true);
  });
});
