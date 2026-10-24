// CLI plumbing shared by every shop node: flags, the data dir, exit codes.
//
// A node is a process: flags in, JSON out, 0/1/2 back. No node reads another
// node's config and no node knows who called it.

import { parseFlags } from "../cli.mjs";
import { readEnv } from "../env.mjs";
import { DEFAULT_URL } from "./wc.mjs";

export const DEFAULT_HOST = new URL(DEFAULT_URL).host;

/** Host of the site this run targets: `--host`, else the URL env, else the default. */
export function resolveHost(flags = {}, env = process.env) {
  if (flags.host) return String(flags.host).replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const url = readEnv("HELLOROBOT_WP_URL", env);
  if (url) return String(url).replace(/^https?:\/\//, "").replace(/\/+$/, "");
  return DEFAULT_HOST;
}

/** `data/<host>` unless `--data` overrides it. */
export function resolveDataDir(flags = {}, env = process.env) {
  if (flags.data) return String(flags.data).replace(/\\/g, "/").replace(/\/+$/, "");
  return `data/${resolveHost(flags, env)}`;
}

/** Parses flags with the shop defaults and returns `{ flags, host, dir }`. */
export function parseShop(argv, spec = {}) {
  const flags = parseFlags(argv, {
    host: "string",
    data: "string",
    out: "string",
    quiet: "boolean",
    ...spec,
  });
  return { flags, host: resolveHost(flags), dir: resolveDataDir(flags) };
}

/** Runs a node body; a thrown error prints one line and exits 2 with no stack. */
export async function runNode(body) {
  try {
    const code = await body();
    process.exitCode = Number.isFinite(code) ? code : 0;
  } catch (error) {
    console.error(`ошибка: ${error?.message ?? error}`);
    if (error?.cause) console.error(`причина: ${error.cause?.message ?? error.cause}`);
    process.exitCode = 2;
  }
}

/** One line per row for stdout; the JSON file stays the machine contract. */
export function printRows(rows, columns) {
  const width = columns.map((column) =>
    Math.max(column.length, ...rows.map((row) => String(row[column] ?? "").length)),
  );
  for (const row of rows) {
    console.log(columns.map((column, index) => String(row[column] ?? "").padEnd(width[index])).join("  "));
  }
}
