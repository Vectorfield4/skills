import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const SCRIPT = fileURLToPath(
  new URL("../skills/creative/generate-image-cover/scripts/image-prompt.mjs", import.meta.url),
);

/** Minimal stand-ins for the project's visual language. */
const STUBS = {
  "composition.mjs":
    'const COMPOSITIONS = { wide: { camera: "Camera.", backdrop: "Backdrop.", formation: "{{SCREENS}}", focal: "crimson" } };\n' +
    'export function compositionKeyFor() { return "wide"; }\n' +
    "export function compositionFor(slug, key) { return COMPOSITIONS[key ?? compositionKeyFor(slug)]; }\n",
  "keyword-motifs.mjs":
    "export function resolveKeywordMotifs(keywords, limit) {\n" +
    "  return keywords.slice(0, limit).map((keyword) => `a ${keyword} motif`);\n" +
    "}\n",
  "ui-primitives.mjs":
    "export const VISUAL_COMPOSITIONS = { wide: true };\n" +
    "export function resolveDisplayElements(keys) { return keys.map((key) => `panel ${key}`); }\n" +
    "export function resolveControlElements(keys) { return keys.map((key) => `dial ${key}`); }\n" +
    "export function resolveEmblem(key) { return key ? `an emblem ${key}` : undefined; }\n",
};

function writeProject(root, { withVisualLanguage = true } = {}) {
  writeFileSync(join(root, "package.json"), '{"name":"t"}', "utf8");
  mkdirSync(join(root, "content"), { recursive: true });
  writeFileSync(
    join(root, "content/generation-queue.json"),
    JSON.stringify(
      [
        {
          kind: "article",
          slug: "x",
          title: "X",
          keywords: ["gear"],
          visual_config: {
            focal_element: "cube",
            environment_glow: "laser_lines",
            display_elements: ["screen_a"],
          },
        },
      ],
      null,
      2,
    ),
    "utf8",
  );

  if (!withVisualLanguage) return;
  const dir = join(root, "docs/image-prompts");
  mkdirSync(join(dir, "scene-defined"), { recursive: true });
  for (const [file, text] of Object.entries(STUBS)) writeFileSync(join(dir, file), text, "utf8");
  writeFileSync(
    join(dir, "scene-defined/image.txt"),
    "Subject {{SUBJECT}}. Object {{OBJECT}}. {{VISUAL_IDEA}} Style {{STYLE}} Lang {{LANG}}.",
    "utf8",
  );
  writeFileSync(join(dir, "cover-style.txt"), "style block\n", "utf8");
}

function run(root, args) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { cwd: root, encoding: "utf8" });
}

describe("image-prompt", () => {
  let root;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "prompt-"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("builds the prompt and the meta sidecar from project data", () => {
    writeProject(root);
    const result = run(root, ["article", "x"]);

    expect(result.status).toBe(0);
    const prompt = readFileSync(join(root, "assets/images/articles/x.prompt.txt"), "utf8");
    expect(prompt).toContain("Subject gear.");
    expect(prompt).toContain("Camera.");
    expect(prompt).toContain("panel screen_a");
    expect(prompt).toContain("a gear motif");
    expect(prompt).toContain("style block");

    const meta = JSON.parse(
      readFileSync(join(root, "assets/images/articles/x.meta.json"), "utf8"),
    );
    expect(meta.visual_config.composition).toBe("wide");
    expect(meta.title).toBe("X");
  });

  it("fails with a clear message when the project has no visual language", () => {
    writeProject(root, { withVisualLanguage: false });
    const result = run(root, ["article", "x"]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/the visual language is project data/);
  });

  it("reports a slug that is not in the queue", () => {
    writeProject(root);
    const result = run(root, ["article", "missing"]);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/is not in the generation queue/);
  });
});
