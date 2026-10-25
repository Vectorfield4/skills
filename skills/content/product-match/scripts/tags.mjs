#!/usr/bin/env node
// Tag registry for the news pipeline. One file per site: data/<host>/tags.yaml.
//
//   node scripts/tags.mjs status --file data/<host>/tags.yaml [--ttl-hours 4] [--json]
//   node scripts/tags.mjs sync   --file data/<host>/tags.yaml --input wp-tags.json [--host <host>]
//   node scripts/tags.mjs record --file data/<host>/tags.yaml --tags "гуманоиды,коботы"
//   node scripts/tags.mjs list   --file data/<host>/tags.yaml
//
// `status` is the cheap question every article run asks: is the file usable as is?
// Exit 0 — fresh, 1 — stale or never synced, 2 — error. `sync` is what the
// WordPress skill answers with: it merges an `ewpa/get-tags` dump and stamps
// `synced_at`. `record` is what an article run does: count + 1, latestUpdate = now.
//
// The script never calls WordPress itself: tags come through the WordPress skill
// (MCP `ewpa/get-tags` or the REST dump it writes), because that flow is owned by
// the publishing step.

import { resolve } from "node:path";
import { isEntryPoint, parseFlags } from "#lib/cli.mjs";
import {
  formatAge,
  hostFromUrl,
  mergeWpTags,
  readRegistry,
  readWpTags,
  recordTags,
  registryStatus,
  splitTags,
  writeRegistry,
} from "#lib/product-match.mjs";

const USAGE = `Usage:
  node scripts/tags.mjs status --file data/<host>/tags.yaml [--ttl-hours 4] [--json]
  node scripts/tags.mjs sync   --file data/<host>/tags.yaml --input wp-tags.json [--host <host>]
  node scripts/tags.mjs record --file data/<host>/tags.yaml --tags "тег,тег"
  node scripts/tags.mjs list   --file data/<host>/tags.yaml`;

const SPEC = {
  file: "string",
  input: "string",
  tags: "string",
  host: "string",
  "ttl-hours": "number",
  now: "string",
  json: "boolean",
  help: "boolean",
};

function need(flags, name) {
  if (!flags[name]) throw new Error(`--${name} is required`);
  return flags[name];
}

function statusCommand(flags) {
  const file = resolve(need(flags, "file"));
  const now = flags.now ? new Date(flags.now) : new Date();
  const registry = readRegistry(file);
  const status = registryStatus(registry, { now, ttlHours: flags["ttl-hours"] });
  const tags = registry?.tags ?? {};
  const count = Object.keys(tags).length;

  if (flags.json) {
    console.log(
      JSON.stringify(
        {
          file,
          host: registry?.host ?? null,
          tags: count,
          syncedAt: status.syncedAt,
          ageMinutes: status.ageMinutes,
          ttlHours: status.ttlHours,
          fresh: status.fresh,
          reason: status.reason,
        },
        null,
        2,
      ),
    );
  } else if (!registry) {
    console.log(`${file}: no registry yet — sync it through the WordPress skill`);
  } else if (status.fresh) {
    console.log(
      `${file}: ${count} tags, synced ${formatAge(status.ageMinutes)} ago (ttl ${status.ttlHours}h), fresh`,
    );
  } else {
    console.log(
      `${file}: ${count} tags, ${status.reason === "stale" ? `${formatAge(status.ageMinutes)} > ${status.ttlHours}h` : status.reason} — refresh through the WordPress skill (ewpa/get-tags) and run \`tags.mjs sync\``,
    );
  }

  return status.fresh ? 0 : 1;
}

function syncCommand(flags) {
  const file = resolve(need(flags, "file"));
  const input = resolve(need(flags, "input"));
  const now = flags.now ? new Date(flags.now) : new Date();

  const registry = readRegistry(file);
  const host = flags.host ? hostFromUrl(flags.host) : (registry?.host ?? "");
  const wpTags = readWpTags(input);
  const merged = mergeWpTags(registry, wpTags, { now, host: host || undefined });

  writeRegistry(file, merged);
  console.log(
    `synced ${wpTags.length} tags into ${file} (host ${merged.host || "?"}, synced_at ${merged.syncedAt})`,
  );
  return 0;
}

function recordCommand(flags) {
  const file = resolve(need(flags, "file"));
  const names = splitTags(need(flags, "tags"));
  const now = flags.now ? new Date(flags.now) : new Date();

  if (names.length === 0) throw new Error("--tags is empty");

  const registry = readRegistry(file);
  const host = flags.host ? hostFromUrl(flags.host) : (registry?.host ?? "");
  const { registry: updated, recorded } = recordTags(registry, names, {
    now,
    host: host || undefined,
  });

  writeRegistry(file, updated);
  for (const item of recorded) {
    console.log(`${item.name}: count=${item.count}, latestUpdate=${updated.tags[item.name].latestUpdate}`);
  }
  return 0;
}

function listCommand(flags) {
  const file = resolve(need(flags, "file"));
  const registry = readRegistry(file);
  if (!registry || Object.keys(registry.tags).length === 0) {
    console.log(`${file}: no tags recorded`);
    return 0;
  }

  const rows = Object.entries(registry.tags)
    .map(([name, tag]) => ({ name, ...tag }))
    .sort((a, b) => Number(b.count ?? 0) - Number(a.count ?? 0) || a.name.localeCompare(b.name, "ru"));

  console.log(`synced_at: ${registry.syncedAt ?? "never"}, ttl ${registry.ttlHours}h`);
  for (const row of rows) {
    const cells = [
      row.name,
      `count ${row.count ?? 0}`,
      `latestUpdate ${row.latestUpdate ?? "-"}`,
      row.wp_posts === undefined ? "" : `wp_posts ${row.wp_posts}`,
      row.id === undefined ? "" : `id ${row.id}`,
    ].filter(Boolean);
    console.log(cells.join(" | "));
  }
  return 0;
}

export function run(argv = process.argv.slice(2)) {
  const { _: positional, ...flags } = parseFlags(argv, SPEC);
  const command = positional[0] ?? "";

  if (!command || command === "help" || flags.help) {
    console.log(USAGE);
    return command ? 0 : 2;
  }

  try {
    switch (command) {
      case "status":
        return statusCommand(flags);
      case "sync":
        return syncCommand(flags);
      case "record":
        return recordCommand(flags);
      case "list":
        return listCommand(flags);
      default:
        console.error(`unknown command: ${command}`);
        console.error(USAGE);
        return 2;
    }
  } catch (error) {
    console.error(`error: ${error?.message ?? error}`);
    return 2;
  }
}

if (isEntryPoint(import.meta.url)) {
  process.exitCode = run();
}
