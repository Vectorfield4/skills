// Shared CLI plumbing for a Jev review script: parse the common flags, read a
// pasted draft on `--stdin`, print the report and exit with the skill's code.
// A skill script keeps only its review function and its usage lines.

import { recordFirings } from "./calibration-log.mjs";
import { hasKey, JevError } from "./client.mjs";
import { formatFindings } from "./report.mjs";

/** Parses the shared review flags. Returns `{ flags, rest }` with positional args in `rest`. */
export function parseArgs(argv) {
  const flags = {
    json: false,
    advisory: false,
    stdin: false,
    gate: false,
    lang: "ru",
    minConfidence: undefined,
  };
  const rest = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--json") flags.json = true;
    else if (arg === "--advisory") flags.advisory = true;
    else if (arg === "--stdin") flags.stdin = true;
    else if (arg === "--gate") flags.gate = true;
    else if (arg === "--lang") flags.lang = argv[++i];
    else if (arg === "--min-confidence") flags.minConfidence = Number(argv[++i]);
    else if (arg.startsWith("--")) {
      console.error(`unknown flag: ${arg}`);
      process.exit(2);
    } else rest.push(arg);
  }
  return { flags, rest };
}

/** Reads the whole of standard input (a pasted draft section). */
export async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

/** Prints a report as text (default) or JSON. */
export function printReport(report, json) {
  if (json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  console.log(
    `\n${report.file}  [${report.kind}]  units=${report.units} targets=${report.targets}`,
  );
  console.log(formatFindings(report));
  if (report.verdict) console.log(`· verdict: ${report.verdict}`);
  if (report.usage) {
    console.log(`· tokens: ${report.usage.input_tokens} in / ${report.usage.output_tokens} out`);
  }
}

/**
 * The common entry point. `review(slug, options)` handles a file; optional
 * `inline(text, options)` handles `--stdin`. `usage` is one line or an array.
 * Exits 1 on candidates (unless `--advisory`), 2 on a usage/call error, 0
 * otherwise; prints a skip notice and exits 0 without RUNWARE_API_KEY.
 */
export async function runReviewCli({ review, inline, usage }) {
  const { flags, rest } = parseArgs(process.argv.slice(2));
  const [slug] = rest;
  if (!slug && !(flags.stdin && inline)) {
    for (const line of [].concat(usage)) console.error(line);
    process.exit(2);
  }
  if (!hasKey()) {
    console.log("Jev: пропущено — RUNWARE_API_KEY не задан.");
    process.exit(0);
  }
  const options = { lang: flags.lang };
  try {
    const report = flags.stdin
      ? await inline(await readStdin(), options)
      : await review(slug, options);
    printReport(report, flags.json);
    // Automatic calibration collection: record this document's firings so a
    // later publish can label them (edited vs unchanged). No-op for --stdin.
    recordFirings(report);
    if (flags.gate) {
      // Circuit-breaker exit code: 0 clean, 10 review, 20 fail.
      const verdict = report.verdict ?? (report.findings.length ? "review" : "clean");
      process.exit(verdict === "fail" ? 20 : verdict === "review" ? 10 : 0);
    }
    process.exit(!flags.advisory && report.findings.length ? 1 : 0);
  } catch (error) {
    if (error instanceof JevError) {
      console.error(`Jev error [${error.code}]: ${error.message}`);
      process.exit(2);
    }
    throw error;
  }
}
