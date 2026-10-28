// shop-write translation gate: a Russian-only site must not receive a product
// card with an untranslated English/Chinese paragraph.
//
// Jev (`typesafe:jev@1`) is the semantic judge: one batched `noul` call over the
// product texts, with a deterministic fallback for a run without
// RUNWARE_API_KEY. The fallback only catches gross cases (a long Latin-only
// paragraph); brand and model names stay legal.

import { askDecisions, hasKey } from "../jev/client.mjs";
import { noulQuestion } from "../jev/questions.mjs";
import { makeReport } from "../jev/report.mjs";
import { THRESHOLDS } from "../jev/thresholds.mjs";

export const TRANSLATION_PROMPT_VERSION = "jev-shop-translation@1";

/** Fields that are rendered as shop copy. Tags are canonical site values and skip the gate. */
const TEXT_FIELDS = ["name", "short_description", "description"];

/** A Latin run this long with no Cyrillic is a raw paragraph, not a model name. */
const FALLBACK_WORDS = 8;

function words(text) {
  return String(text ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function hasCyrillic(text) {
  return /[\u0400-\u04FF]/.test(String(text ?? ""));
}

function hasCjk(text) {
  return /[\u3400-\u9FFF]/.test(String(text ?? ""));
}

/**
 * One unit per non-empty rendered field. A model name (`Unitree G1`) is one
 * unit too; the Jev rubric is told that Latin brand names are legal.
 */
export function productTextUnits(products = []) {
  const units = [];
  for (const product of products) {
    for (const field of TEXT_FIELDS) {
      const text = String(product?.[field] ?? "").trim();
      // A two-word label ("старый товар") is noise for Jev and would only
      // produce false positives; the fallback below still guards long Latin.
      if (!text || text.split(/\s+/).filter(Boolean).length < 3) continue;
      units.push({ sku: String(product?.sku ?? ""), field, text });
    }
  }
  return units;
}

/** One `noul` question per unit: the statement is "this text is fully Russian". */
export function translationQuestions(count) {
  const questions = {};
  for (let i = 0; i < count; i += 1) {
    questions[`tr${i}`] = noulQuestion(
      `\`units[${i}]\` is Russian copy for a Russian-only shop: it is fully translated and contains no untranslated English or Chinese sentence or clause of two or more words. A short Russian label, a brand or model name, a number with units, and standard technical terms (AI, ROS 2, LiDAR, SDK, Arduino, Python, Raspberry Pi) do not count as untranslated text.`,
    );
  }
  return questions;
}

/**
 * Findings from the Jev answers.
 *
 * `noul` here is the probability that the desirable statement holds ("this text
 * is Russian copy"). A low value means the text is likely NOT translated, so
 * `noulFinding` (which fires on the low side) is the right collector. The
 * gray zone above it is reported as an advisory so a human can look, but it
 * does not block the write.
 */
export function translationFindings(units, answers, findings = []) {
  units.forEach((unit, i) => {
    const answer = answers?.[`tr${i}`];
    const p = answer?.noul;
    if (typeof p !== "number") return;
    if (p <= 1 - THRESHOLDS.noul) {
      findings.push({
        line: unit.field,
        rule: "UNTRANSLATED_TEXT_CANDIDATE",
        confidence: p,
        detail: `${unit.sku} / ${unit.field}: ${unit.text.slice(0, 90)}`,
        severity: "fail",
      });
    } else if (p <= 1 - THRESHOLDS.violation.review) {
      findings.push({
        line: unit.field,
        rule: "UNTRANSLATED_TEXT_UNSURE",
        confidence: p,
        detail: `${unit.sku} / ${unit.field}: ${unit.text.slice(0, 90)}`,
        severity: "advisory",
      });
    }
  });
  return findings;
}

/**
 * Offline safety net: a long Latin-only paragraph with no Cyrillic is an
 * untranslated description whatever the model would say. A short name or a
 * brand/model pair does not reach the word floor.
 */
export function fallbackFindings(products, findings = []) {
  for (const product of products) {
    for (const field of TEXT_FIELDS) {
      const text = String(product?.[field] ?? "").trim();
      if (!text || hasCyrillic(text) || hasCjk(text)) continue;
      if (words(text).length < FALLBACK_WORDS) continue;
      findings.push({
        line: field,
        rule: "UNTRANSLATED_TEXT_FALLBACK",
        confidence: 1,
        detail: `${product?.sku ?? ""} / ${field}: ${text.slice(0, 90)}`,
        severity: "fail",
      });
    }
  }
  return findings;
}

/**
 * Runs the translation gate over a product batch.
 *
 * `ok` is false when any card carries untranslated text. Without
 * RUNWARE_API_KEY the deterministic fallback still runs, so an offline write
 * cannot silently ship a raw English paragraph.
 */
export async function checkTranslation({ products = [], file = "products/catalog.json" } = {}) {
  const units = productTextUnits(products);
  const fallback = fallbackFindings(products);
  if (units.length === 0) {
    return { ok: true, skipped: "no-text", report: null, findings: [] };
  }

  let findings = [...fallback];
  let usage;
  if (!hasKey()) {
    const report = makeReport({
      kind: "shop-translation",
      slug: "shop",
      lang: "ru",
      file,
      units: units.length,
      findings,
      promptVersion: TRANSLATION_PROMPT_VERSION,
    });
    return { ok: report.verdict !== "fail", skipped: "no-key", report, findings };
  }

  const { answers, usage: used } = await askDecisions({
    state: { units: units.map((unit) => unit.text) },
    questions: translationQuestions(units.length),
  });
  usage = used;
  findings = translationFindings(units, answers, findings);

  const report = makeReport({
    kind: "shop-translation",
    slug: "shop",
    lang: "ru",
    file,
    units: units.length,
    findings,
    usage,
    promptVersion: TRANSLATION_PROMPT_VERSION,
  });
  return { ok: report.verdict !== "fail", skipped: undefined, report, findings };
}

/** Human-readable block list for stdout. */
export function formatBlocked(result) {
  const findings = result?.findings ?? [];
  if (findings.length === 0) return "";
  return findings
    .map((finding) => `  [${finding.line}] ${finding.rule} (${finding.confidence}) — ${finding.detail}`)
    .join("\n");
}
