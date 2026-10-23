// PNG dimensions from the header.
//
// A generated image is accepted only when the real bytes are the size the skill
// asked for. Reading IHDR is enough and costs nothing: no decoder, no dependency.

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** True when the buffer starts with the PNG signature. */
export function isPng(buffer) {
  return buffer.length >= 24 && buffer.subarray(0, 8).equals(SIGNATURE);
}

/** `{ width, height }` from IHDR. Throws when the buffer is not a PNG. */
export function pngSize(buffer) {
  if (!isPng(buffer)) throw new Error("not a PNG");
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

/** The size, or a thrown error when the image is smaller than required. */
export function assertPng(buffer, { minWidth = 1, minHeight = 1 } = {}) {
  const size = pngSize(buffer);
  if (size.width < minWidth || size.height < minHeight) {
    throw new Error(`image is ${size.width}x${size.height}, expected at least ${minWidth}x${minHeight}`);
  }
  return size;
}
