#!/usr/bin/env node
// CLI shim: the real implementation lives in `#lib/geo/utilities/check-domain.mjs`.
// Kept here so SKILL.md paths and existing callers keep working.

import { isEntryPoint } from "#lib/cli.mjs";

const { run } = await import("#lib/geo/utilities/check-domain.mjs");

if (isEntryPoint(import.meta.url)) {
  try {
    process.exitCode = await run(process.argv.slice(2));
  } catch (error) {
    console.error(`check-domain: ${error?.message ?? error}`); // eslint-disable-line no-console
    process.exitCode = 2;
  }
}
