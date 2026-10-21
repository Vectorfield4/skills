/** Word count over unicode letters and digits; shared by the gates. */
export const wordCount = (text) => text.split(/[^\p{L}\p{N}]+/u).filter(Boolean).length;

/** Split an array into consecutive chunks of at most `size` items. */
export function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
