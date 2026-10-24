// Request accounting for the shop run report.
//
// A node process appends one line per outbound HTTP request to the file named by
// `SHOP_METRICS_FILE`; `measure.mjs` counts the lines. Without the env var nothing
// happens, so a node run by hand stays silent.

import { appendFileSync } from "node:fs";

export function noteRequest(url) {
  const file = process.env.SHOP_METRICS_FILE;
  if (!file) return;
  try {
    appendFileSync(file, `${url}\n`, "utf8");
  } catch {
    // Metrics must never break a run.
  }
}
