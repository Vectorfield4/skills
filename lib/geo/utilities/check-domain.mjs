#!/usr/bin/env node
// Read-only guard for the geo domain: does this project's TS/domain layer match
// its map groups and fixtures? Prints one JSON report on stdout, exits 1 when
// any check fails.
//
//   node lib/geo/utilities/check-domain.mjs [--project <root>] [--out report.json]
//
// The checks live in `#lib/geo-domain.mjs`; this module is the chainable edge.
// It uses the same JSON-on-stdout / 0/1/2 exit contract as every other utility.

import { writeJson } from "#lib/geo.mjs";
import { checkGeoDomain } from "#lib/geo-domain.mjs";
import { isEntryPoint, printJson, runUtility } from "#lib/cli.mjs";

const USAGE = `Usage:
  node check-domain.mjs [--project <root>] [--out report.json]

Flags
  --project  project root, default current directory
  --out      write the JSON report to this file
  --help     print this block and exit 0

Exit codes
  0  all checks pass  1  one or more checks failed  2  bad usage or error
`;

const SPEC = { project: "string", out: "string" };

export async function main(flags) {
  const report = checkGeoDomain(flags.project ?? process.cwd());
  if (flags.out) writeJson(flags.out, report);
  printJson(report);
  return report.failed > 0 ? 1 : 0;
}

export async function run(argv = process.argv.slice(2)) {
  return runUtility({ usage: USAGE, spec: SPEC, main, allowEmpty: true, argv });
}

if (isEntryPoint(import.meta.url)) {
  try {
    process.exitCode = await run(process.argv.slice(2));
  } catch (error) {
    console.error(`check-domain: ${error?.message ?? error}`); // eslint-disable-line no-console
    process.exitCode = 2;
  }
}
