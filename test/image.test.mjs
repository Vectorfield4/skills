import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { faviconPrompt, logoPrompt } from "../lib/image-prompts.mjs";
import { assertPng, isPng, pngSize } from "../lib/png.mjs";
import { renderAndSave } from "../lib/render-image.mjs";
import { imageInference } from "../lib/runware.mjs";

/** A 24-byte PNG header: signature plus IHDR with the given size. */
function fakePng(width, height) {
  const buffer = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer, 0);
  buffer.writeUInt32BE(13, 8);
  buffer.write("IHDR", 12, "ascii");
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

describe("png header", () => {
  it("reads the real size", () => {
    expect(pngSize(fakePng(512, 256))).toEqual({ width: 512, height: 256 });
  });

  it("rejects a buffer that is not a PNG", () => {
    expect(isPng(Buffer.from("GIF89a"))).toBe(false);
    expect(() => pngSize(Buffer.from("not an image at all, really"))).toThrow(/not a PNG/);
  });

  it("enforces a minimum size", () => {
    expect(assertPng(fakePng(1024, 512), { minWidth: 512, minHeight: 512 })).toEqual({
      width: 1024,
      height: 512,
    });
    expect(() => assertPng(fakePng(256, 256), { minWidth: 512 })).toThrow(/expected at least/);
  });
});

describe("default prompts", () => {
  it("carries the name, topic and colours into the favicon prompt", () => {
    const { prompt, negativePrompt } = faviconPrompt({
      name: "hellorobot",
      topic: "robotics",
      bg: "#1f1f1f",
      fg: "#ffffff",
    });
    expect(prompt).toContain("hellorobot");
    expect(prompt).toContain("robotics");
    expect(prompt).toContain("#1f1f1f");
    expect(prompt).toContain("#ffffff");
    expect(negativePrompt).toContain("text");
  });

  it("puts the wordmark text in quotes for the logo prompt", () => {
    const { prompt } = logoPrompt({ name: "hellorobot", topic: "robotics news" });
    expect(prompt).toContain('"hellorobot"');
    expect(prompt).toContain("wordmark");
    expect(prompt).toContain("robotics news");
  });
});

describe("renderAndSave", () => {
  let root;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "render-"));
    process.env.RUNWARE_API_KEY = "test-key";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.RUNWARE_API_KEY;
    rmSync(root, { recursive: true, force: true });
  });

  it("infers, downloads, verifies and writes the PNG", async () => {
    const png = fakePng(512, 512);
    vi.stubGlobal("fetch", async (url, init) => {
      if (init?.method === "POST") {
        return { ok: true, json: async () => ({ data: [{ imageURL: "https://img.test/a.png" }] }) };
      }
      return {
        ok: true,
        arrayBuffer: async () => png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength),
      };
    });

    const result = await renderAndSave({
      prompt: "flat vector robot head",
      model: "runware:5@1",
      width: 512,
      height: 512,
      out: "public/favicon.png",
      root,
    });

    expect(result).toMatchObject({ ok: true, file: "public/favicon.png", width: 512, height: 512 });
    expect(readFileSync(join(root, "public/favicon.png")).length).toBe(24);
  });

  it("refuses an image smaller than asked for and writes nothing", async () => {
    const png = fakePng(256, 256);
    vi.stubGlobal("fetch", async (_url, init) => {
      if (init?.method === "POST") {
        return { ok: true, json: async () => ({ data: [{ imageURL: "https://img.test/a.png" }] }) };
      }
      return {
        ok: true,
        arrayBuffer: async () => png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength),
      };
    });

    await expect(
      renderAndSave({
        prompt: "icon",
        model: "runware:5@1",
        width: 512,
        height: 512,
        out: "public/favicon.png",
        root,
      }),
    ).rejects.toThrow(/expected at least/);
  });

  it("surfaces a missing key before any network call", async () => {
    await expect(
      imageInference({ prompt: "x", model: "m", width: 1, height: 1, env: {} }),
    ).rejects.toThrow(/RUNWARE_API_KEY/);
  });
});
