#!/usr/bin/env node
// Read-only edge of the generation queue: what is still pending, and what does
// one record look like. The queue engine lives in `#lib/generation-queue.mjs`;
// this module only answers the question without mutating the file, so a
// PowerShell or bash chain can list and inspect without a write.
//
//   node lib/content/utilities/query-queue.mjs list [--kind article|service|solution] [--json]
//   node lib/content/utilities/query-queue.mjs get <kind> <slug>
//
// Exit codes: 0 found, 1 not found, 2 bad usage.

import { isEntryPoint, runUtility } from "#lib/cli.mjs";
import { getEntry, KINDS, readQueue } from "#lib/generation-queue.mjs";
import { projectRoot } from "#lib/project.mjs";

const USAGE = `query-queue: read the pending image queue as JSON

  node query-queue.mjs list [--kind article|service|solution]
  node query-queue.mjs get <kind> <slug>

Flags
  --kind    Narrow the list to one kind.
  --help    Print this block and exit 0.

Exit codes
  0  ok          1  entry not found          2  bad usage
`;

export function listCommand(flags) {
  const entries = readQueue({ root: projectRoot() }).filter(
    (entry) => !flags.kind || entry.kind === flags.kind,
  );
  console.log(JSON.stringify(entries, null, 2));
  return 0;
}

export function getCommand(positional) {
  const [kind, slug] = positional;
  if (!kind || !slug) throw new Error("get needs <kind> <slug>");
  const entry = getEntry(kind, slug, { root: projectRoot() });
  if (!entry) {
    console.log(JSON.stringify({ ok: false, kind, slug, entry: null }, null, 2));
    return 1;
  }
  console.log(JSON.stringify({ ok: true, kind, slug, entry }, null, 2));
  return 0;
}

async function main(flags) {
  const command = flags._[0];
  if (command === "list") return listCommand(flags);
  if (command === "get") return getCommand(flags._.slice(1));
  throw new Error(`unknown command "${command ?? ""}"; expected list or get`);
}

export async function run(argv = process.argv.slice(2)) {
  return runUtility({
    usage: USAGE,
    spec: { kind: "string" },
    main,
    allowEmpty: true,
    argv,
  });
}

if (isEntryPoint(import.meta.url)) {
  try {
    process.exitCode = await run(process.argv.slice(2));
  } catch (error) {
    console.error(`query-queue: ${error?.message ?? error}`); // eslint-disable-line no-console
    process.exitCode = 2;
  }
}
