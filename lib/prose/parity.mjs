// RU↔EN claim parity. The deterministic part compares only facts — numeric
// claim tokens — in code; the advisory Jev verdict (in the skill CLI) judges
// whether the two languages carry the same claims. Style, structure and
// localization are out of scope, so stylistic adaptation is never a finding.

/** Normalized numeric claim tokens (two or more digits), unit-aware. */
export function claimNumbers(text) {
  const out = new Set();
  const re = /\d[\d\s.,]*\s*(?:%|₽|руб\.?|тыс\.?|млн|млрд)?/g;
  for (const match of text.matchAll(re)) {
    const norm = match[0]
      .replace(/\s+/g, "")
      .replace(/,(\d{3})/g, "$1")
      .replace(",", ".");
    if (norm.replace(/\D/g, "").length >= 2) out.add(norm);
  }
  return out;
}

/** Push a finding for every number present on one side only. */
export function parityFindings(ru, en, findings) {
  const ruNumbers = claimNumbers(ru);
  const enNumbers = claimNumbers(en);
  for (const value of ruNumbers) {
    if (!enNumbers.has(value)) {
      findings.push({
        line: 0,
        rule: "PARITY_NUMBER_MISSING",
        confidence: 1,
        detail: `RU ${value}`,
      });
    }
  }
  for (const value of enNumbers) {
    if (!ruNumbers.has(value)) {
      findings.push({ line: 0, rule: "PARITY_NUMBER_ADDED", confidence: 1, detail: `EN ${value}` });
    }
  }
}
