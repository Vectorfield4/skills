// Jev report assembly and rendering: one shape, one formatter, shared by every
// domain. The prompt version is supplied by the domain that owns the rubrics.

/** The report shape returned when RUNWARE_API_KEY is absent. */
export const noKeyReport = (kind, slug, lang, promptVersion) => ({
  kind,
  slug,
  lang,
  skipped: "no-key",
  findings: [],
  promptVersion,
});

/** Drops duplicate `line|rule` findings, keeping the first. */
export function dedupe(findings) {
  return [...new Map(findings.map((f) => [`${f.line}|${f.rule}`, f])).values()];
}

/**
 * The circuit-breaker verdict over a document's findings. Only `fail` and
 * `review` severities gate: a `fail` is a gross violation (redraft, no critic),
 * a `review` is the gray zone (dispatch the critic), and neither means `clean`
 * (light confirm). `advisory` findings are reported and forwarded to the critic
 * but never move the verdict — that is where not-yet-calibrated signals live.
 */
export function verdictOf(findings) {
  if (findings.some((f) => f.severity === "fail")) return "fail";
  if (findings.some((f) => f.severity === "review")) return "review";
  return "clean";
}

/** The report object every domain returns. */
export function makeReport({
  kind,
  slug,
  lang,
  file,
  units,
  targets = 0,
  findings,
  usage,
  promptVersion,
}) {
  const deduped = dedupe(findings);
  return {
    kind,
    slug,
    lang,
    file,
    units,
    targets,
    findings: deduped,
    verdict: verdictOf(deduped),
    usage,
    promptVersion,
  };
}

/**
 * Merge the reports of a batched review (an oversized document split at unit
 * boundaries) into one: findings deduped, unit counts and token usage summed.
 * A batch that was skipped for a missing key stays a skip.
 */
export function mergeReports(reports) {
  if (reports.length === 1 || reports[0].skipped) return reports[0];
  const usage = reports.reduce((acc, report) => {
    if (!report.usage) return acc;
    return {
      input_tokens: (acc?.input_tokens ?? 0) + report.usage.input_tokens,
      output_tokens: (acc?.output_tokens ?? 0) + report.usage.output_tokens,
    };
  }, null);
  const base = reports[0];
  return makeReport({
    kind: base.kind,
    slug: base.slug,
    lang: base.lang,
    file: base.file,
    units: reports.reduce((sum, report) => sum + report.units, 0),
    targets: base.targets,
    findings: reports.flatMap((report) => report.findings),
    usage: usage ?? undefined,
    promptVersion: base.promptVersion,
  });
}

/** One `[file:line] RULE (conf)` line per finding, for the skill procedures. */
export function formatFindings(report) {
  if (report.skipped) return `Jev: пропущено (${report.skipped}) — RUNWARE_API_KEY не задан.`;
  if (!report.findings.length) return "Jev: кандидатов нет.";
  return report.findings
    .map((f) => {
      const where = f.line ? `[${report.file}:${f.line}]` : `[${report.file}]`;
      const detail = f.detail ? ` — ${f.detail}` : "";
      return `${where} ${f.rule} (${f.confidence})${detail}`;
    })
    .join("\n");
}
