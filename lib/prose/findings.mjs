// The content gates' answer→finding mapping, over the generic collectors in
// `lib/jev/findings.mjs`.

import { noulFinding } from "../jev/findings.mjs";
import { wordCount } from "../jev/text.mjs";
import { THRESHOLDS } from "../jev/thresholds.mjs";
import { FILTER_IDS } from "./prompts.mjs";

const detail = (unit) => unit.text.slice(0, 90);
/** Short fragments (titles, labels) are noisy in the dead zone: skip escalation. */
const UNSURE_MIN_WORDS = 6;

/**
 * G1 verdicts into findings. One confident violation (`noul ≥ act`) per filter
 * becomes `<FILTER>_CANDIDATE`. A unit with no violation but at least one
 * answer in the dead zone (`review ≤ noul < act`) yields a single
 * `<FILTER>_UNSURE` for the critic — the strongest mid-zone filter.
 */
export function filterFindings(units, answers, findings) {
  const { act, review } = THRESHOLDS.violation;
  units.forEach((unit, i) => {
    let fired = false;
    let top = null;
    for (const id of FILTER_IDS) {
      const answer = answers[`u${i}_${id}`];
      if (!answer) continue;
      const p = answer.noul;
      if (p >= act) {
        findings.push({
          line: unit.line,
          rule: `${id.toUpperCase()}_CANDIDATE`,
          confidence: p,
          detail: detail(unit),
          severity: "fail",
        });
        fired = true;
      } else if (p >= review && (!top || p > top.p)) {
        top = { id, p };
      }
    }
    if (!fired && top && wordCount(unit.text) >= UNSURE_MIN_WORDS) {
      findings.push({
        line: unit.line,
        rule: `${top.id.toUpperCase()}_UNSURE`,
        confidence: top.p,
        detail: detail(unit),
        severity: "review",
      });
    }
  });
}

/** G2: a linked target the model confidently reads as off-topic. */
export function relevanceFindings(targets, answers, findings) {
  targets.forEach((target, i) => {
    if (!target.text) return;
    noulFinding(findings, answers[`rel${i}`], {
      line: 0,
      rule: "RELEVANT_FIT_CANDIDATE",
      detail: `${target.type}:${target.slug}`,
    });
  });
}
