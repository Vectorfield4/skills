#!/usr/bin/env node
// Where am I? The project root and its configured skill settings, as JSON.
//
//   node lib/project/utilities/where.mjs
//   node lib/project/utilities/where.mjs --config skills.config.json
//
// Every skill script resolves paths from the nearest `package.json` ancestor, not
// from its own location. This utility prints that resolution so a PowerShell or
// bash chain can branch on it without re-implementing the walk.

import { join } from "node:path";

import { isEntryPoint, runUtility } from "#lib/cli.mjs";
import { projectRoot, readConfig, readJsonIfExists } from "#lib/project.mjs";

const USAGE = `where: print the project root and its skill config as JSON

  node where.mjs [--config <name>] [--help]

Flags
  --config   Config file name, default "skills.config.json".
  --help     Print this block and exit 0.

Exit codes
  0  ok          2  bad usage
`;

const SPEC = { config: "string" };

export async function main(flags) {
  const root = projectRoot();
  const config = readConfig(root, flags.config ?? "skills.config.json");
  console.log(JSON.stringify({ root, config, packageJson: join(root, "package.json"), configExists: Boolean(readJsonIfExists(join(root, flags.config ?? "skills.config.json"), null)) }, null, 2));
  return 0;
}

export async function run(argv = process.argv.slice(2)) {
  return runUtility({ usage: USAGE, spec: SPEC, main, allowEmpty: true, argv });
}

if (isEntryPoint(import.meta.url)) {
  try {
    process.exitCode = await run(process.argv.slice(2));
  } catch (error) {
    console.error(`where: ${error?.message ?? error}`); // eslint-disable-line no-console
    process.exitCode = 2;
  }
}
