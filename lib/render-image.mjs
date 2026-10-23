// Render one image: infer, download, verify the real pixels, write the file.
//
// The verification is part of the contract, not a suggestion: a response URL is
// not an image, and a wrong size breaks the layout that consumes it.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { assertPng } from "./png.mjs";
import { downloadImage, imageInference } from "./runware.mjs";

/**
 * Render and save one PNG. `out` is relative to `root`; the returned `file` is
 * the same relative path, so the caller can print it without leaking the root.
 */
export async function renderAndSave({
  prompt,
  negativePrompt,
  model,
  width,
  height,
  steps,
  cfgScale,
  seed,
  out,
  root = process.cwd(),
  minWidth = width,
  minHeight = height,
}) {
  const imageURL = await imageInference({
    prompt,
    negativePrompt,
    model,
    width,
    height,
    steps,
    cfgScale,
    seed,
  });
  const buffer = await downloadImage(imageURL);
  const size = assertPng(buffer, { minWidth, minHeight });

  const file = resolve(root, out);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, buffer);

  return { ok: true, file: out, bytes: buffer.length, width: size.width, height: size.height, model };
}
