#!/usr/bin/env node
// CLI wrapper for the geo domain guard. The checks live in #lib/geo-domain.mjs.

import { writeJson } from "#lib/geo.mjs";
import { checkGeoDomain } from "#lib/geo-domain.mjs";
import { isEntryPoint, parseFlags } from "#lib/cli.mjs";

const usage = `Usage:
  node scripts/check-domain.mjs [--project D:/docs/GitHub/vodaizrodnika] [--out report.json]

Flags:
  --project  project root, default current directory
  --out      write the JSON report to this file`;

const main = () => {
  const flags = parseFlags(process.argv.slice(2), { project: "string", out: "string" });
  const report = checkGeoDomain(flags.project ?? process.cwd());

  if (flags.out) writeJson(flags.out, report);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (report.failed > 0) process.exit(1);
};

if (isEntryPoint(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  }
}
