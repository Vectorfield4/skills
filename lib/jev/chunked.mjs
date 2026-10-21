// Review a document as one request per chunk of units, merged into one report.
//
// Chunking exists only for the token ceiling: a document that fits travels as a
// single request (the default case), and a larger one is split at unit
// boundaries. `describe(units, global, index)` returns the per-chunk state,
// questions, target count and findings mapping; the runner owns the loop.

import { mergeReports } from "./report.mjs";
import { runReview } from "./review.mjs";
import { chunk } from "./text.mjs";

/** One request per chunk of `chunkSize` units; findings and usage merge. */
export async function runChunkedReview({
  kind,
  slug,
  lang,
  file,
  promptVersion,
  units,
  chunkSize,
  describe,
}) {
  const chunks = chunk(units, chunkSize);
  const reports = [];
  for (let index = 0; index < chunks.length; index += 1) {
    const spec = describe(chunks[index], index === 0, index);
    reports.push(
      await runReview({
        kind,
        slug,
        lang,
        file,
        promptVersion,
        state: spec.state,
        questions: spec.questions,
        units: chunks[index].length,
        targets: spec.targets ?? 0,
        findingsFrom: spec.findingsFrom,
      }),
    );
  }
  return mergeReports(reports);
}
