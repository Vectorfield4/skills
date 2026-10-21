// Service dictionary parsing for the Jev review gates (skill: write-service).
//
// A service copy is a TS dictionary of string literals. `serviceStrings` (the
// shared `tsStrings`) locates every prose literal with its line; `serviceBlocks`
// gives the structured view G5 needs (titled items, `mechanism`, `sections`).
// Neither judges anything — it only locates text. The bracket helpers are
// shared from `lib/prose/ts.mjs`.

import { tsStrings } from "#lib/prose/ts.mjs";
import { arraySpan, fieldString, objectSpans, stringsIn } from "#lib/prose/ts-blocks.mjs";

export { tsStrings as serviceStrings };

/** Titled blocks (features, mechanism, …) worth a semantic check. */
const TITLED_BLOCKS = [
  "features",
  "mechanism",
  "deliverables",
  "tradeoffs",
  "outcomes",
  "proofItems",
];

/**
 * Structured view of a service dictionary for G5: titled `{title, text}` items,
 * the `mechanism` items in order, and `sections` items. Line numbers point at the
 * string literal in the source file.
 */
export function serviceBlocks(tsSource) {
  const titled = {};
  for (const key of TITLED_BLOCKS) {
    const span = arraySpan(tsSource, key);
    if (!span) continue;
    titled[key] = objectSpans(tsSource, span.start, span.end).map((o) => {
      const title = fieldString(tsSource, o.start, o.end, "title");
      const text = fieldString(tsSource, o.start, o.end, "text");
      return {
        key,
        title: title?.value ?? null,
        titleLine: title?.line ?? null,
        text: text?.value ?? null,
        textLine: text?.line ?? null,
      };
    });
  }
  const sections = [];
  const sectionSpan = arraySpan(tsSource, "sections");
  if (sectionSpan) {
    for (const o of objectSpans(tsSource, sectionSpan.start, sectionSpan.end)) {
      const title = fieldString(tsSource, o.start, o.end, "title");
      const itemsSpan = arraySpan(tsSource, "items", o.start, o.end);
      sections.push({
        title: title?.value ?? null,
        items: itemsSpan ? stringsIn(tsSource, itemsSpan.start, itemsSpan.end) : [],
      });
    }
  }
  return { titled, mechanism: titled.mechanism ?? [], sections };
}
