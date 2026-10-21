// One batched Jev call per document, then a report. The domain supplies the
// state, the questions and a `findingsFrom(answers)` mapping; everything else
// is engine plumbing.

import { askDecisions, hasKey } from "./client.mjs";
import { makeReport, noKeyReport } from "./report.mjs";

/**
 * Runs one decisions request for a document and assembles its report.
 * Without RUNWARE_API_KEY it returns the no-key report instead of calling out.
 */
export async function runReview({
  kind,
  slug,
  lang,
  file,
  promptVersion,
  state,
  questions,
  units,
  targets = 0,
  minConfidence,
  findingsFrom,
}) {
  if (!hasKey()) return noKeyReport(kind, slug, lang, promptVersion);
  const { answers, usage } = await askDecisions({ state, questions });
  return makeReport({
    kind,
    slug,
    lang,
    file,
    units,
    targets,
    findings: findingsFrom(answers, minConfidence),
    usage,
    promptVersion,
  });
}
