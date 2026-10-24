// Run report: what happened, what was reused, and whether a re-run changed bytes.

import { existsSync } from "node:fs";
import { nodeOrder } from "./manifest.mjs";
import { readJsonSafe } from "./stable.mjs";

export function summarize(manifest) {
  const nodes = manifest?.nodes ?? {};
  const rows = nodeOrder(manifest).map((node) => ({
    node,
    status: nodes[node]?.status ?? "missing",
    ms: nodes[node]?.ms ?? 0,
    requests: nodes[node]?.requests ?? 0,
    reused: nodes[node]?.status === "reused",
  }));

  const executed = rows.filter((row) => row.status !== "reused" && row.status !== "missing").length;
  const reused = rows.filter((row) => row.reused).length;
  const failed = rows.filter((row) => row.status === "failed").length;

  return {
    host: manifest?.host ?? "",
    nodes: rows.length,
    executed,
    reused,
    failed,
    requests: rows.reduce((sum, row) => sum + row.requests, 0),
    ms: rows.reduce((sum, row) => sum + row.ms, 0),
    rows,
  };
}

/** Previous run vs this run: executed/reused counts and which nodes changed. */
export function diffRuns(before, after) {
  if (!before) return { first: true, changed: [], same: [] };
  const changed = [];
  const same = [];
  for (const node of nodeOrder(after)) {
    const left = before?.nodes?.[node]?.outputs ?? null;
    const right = after?.nodes?.[node]?.outputs ?? null;
    if (left && right && left === right) same.push(node);
    else changed.push(node);
  }
  return { first: false, changed, same };
}

/** Prints the report table and returns the summary. */
export function printReport(manifest, { label = "shop run" } = {}) {
  const summary = summarize(manifest);
  console.log(`${label}: ${summary.host || "(no host)"}`);
  const width = Math.max(4, ...summary.rows.map((row) => row.node.length));
  for (const row of summary.rows) {
    const label =
      row.status === "ok" ? "ok" : row.status === "reused" ? "skip" : row.status === "missing" ? "-" : "FAIL";
    console.log(
      `${label.padEnd(4)} ${row.node.padEnd(width)}  ${String(row.ms).padStart(6)} ms  ${String(row.requests).padStart(3)} req`,
    );
  }
  console.log(
    `итого: узлов ${summary.nodes}, выполнено ${summary.executed}, переиспользовано ${summary.reused}, ошибок ${summary.failed}, ${summary.requests} запросов, ${summary.ms} ms`,
  );
  return summary;
}

/** Reads the summary a previous run left next to its manifest. */
export function readSummary(dir) {
  const file = `${dir}/summary.json`;
  return existsSync(file) ? readJsonSafe(file) : null;
}
