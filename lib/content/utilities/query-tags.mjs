#!/usr/bin/env node
// Read-only edge of the tag registry: is the file fresh, and what tags are on
// file? The registry codec lives in `#lib/product-match.mjs`; this module only
// answers the questions, so a chain can branch without a WordPress call.
//
//   node lib/content/utilities/query-tags.mjs status --file data/<host>/tags.yaml [--ttl-hours 4]
//   node lib/content/utilities/query-tags.mjs list   --file data/<host>/tags.yaml
//
// Exit codes: 0 fresh or listed, 1 stale or missing, 2 bad usage.

import { resolve } from "node:path";

import { isEntryPoint, runUtility } from "#lib/cli.mjs";
import {
  formatAge,
  readRegistry,
  registryStatus,
} from "#lib/product-match.mjs";

const USAGE = `query-tags: read the tag registry as JSON

  node query-tags.mjs status --file data/<host>/tags.yaml [--ttl-hours 4] [--json]
  node query-tags.mjs list   --file data/<host>/tags.yaml

Flags
  --file      Registry file. Required.
  --ttl-hours TTL in hours (default 4).
  --now       Override "now" (ISO date) for testing.
  --help      Print this block and exit 0.

Exit codes
  0  fresh or listed   1  stale or missing   2  bad usage
`;

const SPEC = { file: "string", "ttl-hours": "number", now: "string" };

function statusCommand(flags) {
  const file = resolve(flags.file);
  const registry = readRegistry(file);
  const now = flags.now ? new Date(flags.now) : new Date();
  const status = registryStatus(registry, { now, ttlHours: flags["ttl-hours"] });
  const tags = registry?.tags ?? {};

  const report = {
    ok: Boolean(registry),
    file,
    host: registry?.host ?? null,
    tags: Object.keys(tags).length,
    syncedAt: status.syncedAt,
    ageMinutes: status.ageMinutes,
    ttlHours: status.ttlHours,
    fresh: status.fresh,
    reason: status.reason,
  };
  console.log(JSON.stringify(report, null, 2));
  return registry && status.fresh ? 0 : 1;
}

function listCommand(flags) {
  const file = resolve(flags.file);
  const registry = readRegistry(file);
  if (!registry || Object.keys(registry.tags).length === 0) {
    console.log(JSON.stringify({ ok: true, file, tags: [] }, null, 2));
    return 0;
  }
  const rows = Object.entries(registry.tags)
    .map(([name, tag]) => ({ name, ...tag }))
    .sort((a, b) => Number(b.count ?? 0) - Number(a.count ?? 0) || a.name.localeCompare(b.name, "ru"));
  console.log(JSON.stringify({ ok: true, file, syncedAt: registry.syncedAt ?? null, tags: rows }, null, 2));
  return 0;
}

async function main(flags) {
  const command = flags._[0];
  if (command === "status") return statusCommand(flags);
  if (command === "list") return listCommand(flags);
  throw new Error(`unknown command "${command ?? ""}"; expected status or list`);
}

export async function run(argv = process.argv.slice(2)) {
  return runUtility({ usage: USAGE, spec: SPEC, main, allowEmpty: true, argv });
}

if (isEntryPoint(import.meta.url)) {
  try {
    process.exitCode = await run(process.argv.slice(2));
  } catch (error) {
    console.error(`query-tags: ${error?.message ?? error}`); // eslint-disable-line no-console
    process.exitCode = 2;
  }
}
