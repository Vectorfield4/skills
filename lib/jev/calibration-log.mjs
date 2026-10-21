// Automatic calibration collection. Every file review appends its findings — the
// unit prefix, the rule and the confidence — to an append-only log under
// `.cache/jev-calibration/`; publishing a document then labels each firing: a
// flagged unit that is still present in the published text was a false alarm
// (`false`), an edited one was acted on (`real`). The labeled rows accumulate
// without manual work and can be promoted into `lib/prose/calibration-fixtures.json`.
//
// It is a bootstrap, not an oracle: the `edited` heuristic is noisy and only
// firing units are recorded, so a human pass over a sample still owns the gold
// corpus. The log is local and gitignored; nothing here touches the network.

import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const DIR = path.join(ROOT, ".cache", "jev-calibration");
const FIRINGS = path.join(DIR, "firings.jsonl");
const LABELED = path.join(DIR, "labeled.jsonl");

/** Append a document's findings to the firings log (no-op for stdin or empty). */
export function recordFirings({ kind, slug, lang, findings }) {
  if (!slug || slug === "(stdin)" || !findings?.length) return 0;
  mkdirSync(DIR, { recursive: true });
  const rows = findings.map((f) => ({
    ts: Date.now(),
    kind,
    slug,
    lang,
    rule: f.rule,
    severity: f.severity ?? "advisory",
    confidence: f.confidence ?? null,
    detail: (f.detail ?? "").slice(0, 120),
  }));
  appendFileSync(FIRINGS, `${rows.map((r) => JSON.stringify(r)).join("\n")}\n`, "utf8");
  return rows.length;
}

/**
 * Label a published document's firings: a firing whose flagged text is still in
 * the body is `false`; one that was edited out is `real`. Returns the count.
 */
export function labelPublished({ kind, slug, lang, body }) {
  if (!existsSync(FIRINGS)) return 0;
  const rows = readFileSync(FIRINGS, "utf8")
    .split("\n")
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    })
    .filter((r) => r.kind === kind && r.slug === slug && r.lang === lang);
  // Only unit-level findings carry the flagged prose in `detail`; document
  // findings carry a short label (a sensor id, "lead hook", "service:…") that is
  // not in the body. Compare prose-length details only.
  const comparable = rows.filter((r) => (r.detail ?? "").length >= 40);
  if (!comparable.length) return 0;
  mkdirSync(DIR, { recursive: true });
  // Normalize whitespace: a finding's `detail` is a paragraph with lines joined
  // by spaces, while the file body keeps its line breaks.
  const squeeze = (s) => s.replace(/\s+/g, " ");
  const hay = squeeze(body);
  const labeled = comparable.map((r) => ({
    ...r,
    label: hay.includes(squeeze(r.detail)) ? "false" : "real",
  }));
  appendFileSync(LABELED, `${labeled.map((r) => JSON.stringify(r)).join("\n")}\n`, "utf8");
  return labeled.length;
}

/** The labeled rows recorded so far, for the calibration review. */
export function readLabeled() {
  if (!existsSync(LABELED)) return [];
  return readFileSync(LABELED, "utf8")
    .split("\n")
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    });
}
