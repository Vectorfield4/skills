// Answer→finding collectors shared by every domain. A domain supplies the rule
// naming and the line/detail; the threshold logic lives here once.

import { THRESHOLDS } from "./thresholds.mjs";

/**
 * Collect `choice` verdicts, one per unit: a dominant label other than `none`
 * above `minConfidence` becomes a finding. `ruleFor(choice)` names the rule.
 */
export function collectChoices({
  units,
  answers,
  prefix = "u",
  minConfidence,
  ruleFor,
  findings,
  severity = "advisory",
  detail = (unit) => unit.text.slice(0, 90),
}) {
  units.forEach((unit, i) => {
    const answer = answers[`${prefix}${i}`];
    if (!answer || answer.choice === "none" || answer.confidence < minConfidence) return;
    findings.push({
      line: unit.line,
      rule: ruleFor(answer.choice),
      confidence: answer.confidence,
      detail: detail(unit),
      severity,
    });
  });
}

/**
 * Push a finding when a `noul` answer says "no" (a low value) with confidence.
 * `threshold` is the strong-yes bar; a no at or below `1 - threshold` fires.
 */
export function noulFinding(
  findings,
  answer,
  { line, rule, detail, threshold = THRESHOLDS.noul, severity = "advisory" },
) {
  if (!answer || answer.noul > 1 - threshold) return;
  findings.push({ line, rule, confidence: answer.noul, detail, severity });
}

/**
 * Push a finding when a `noul` answer says "yes" (a high value) with confidence.
 * The mirror of `noulFinding`: fires when `answer.noul` reaches `threshold`.
 */
export function noulYes(
  findings,
  answer,
  { line, rule, detail, threshold = THRESHOLDS.noul, severity = "advisory" },
) {
  if (!answer || answer.noul < threshold) return;
  findings.push({ line, rule, confidence: answer.noul, detail, severity });
}
