#!/usr/bin/env node
// Publish an article to a WordPress REST API.
//
// Usage:
//   node scripts/publish.mjs --config site.json --file article.json [--out result.json] [--dry-run]
//
// The site config names the base URL and the credentials. Secrets may live in
// environment variables, so the config file itself stays clean.

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { isEntryPoint } from "#lib/cli.mjs";
import { publishArticle, upsertArticle, findPostBySlug, toWpPost } from "#lib/wp-client.mjs";
import { resolveWpConfig } from "#lib/wp-config.mjs";

const USAGE =
  "Usage: node scripts/publish.mjs --config site.json --file article.json [--out result.json] [--dry-run] [--upsert]";

const SLOT_FLAGS = [
  { flag: "--base-url", set: ["baseUrl"], clear: ["baseUrlKey"] },
  { flag: "--base-url-key", set: ["baseUrlKey"], clear: ["baseUrl"] },
  { flag: "--user", set: ["auth", "user"], clear: ["auth", "userKey"] },
  { flag: "--user-key", set: ["auth", "userKey"], clear: ["auth", "user"] },
  { flag: "--password", set: ["auth", "password"], clear: ["auth", "passwordKey"] },
  { flag: "--password-key", set: ["auth", "passwordKey"], clear: ["auth", "password"] },
  { flag: "--token", set: ["auth", "token"], clear: ["auth", "tokenKey"] },
  { flag: "--token-key", set: ["auth", "tokenKey"], clear: ["auth", "token"] },
];

const PLAIN_FLAGS = {
  "--config": "config",
  "--file": "file",
  "--out": "out",
  "--auth-type": "authType",
};

const BOOLEAN_FLAGS = { "--dry-run": "dryRun", "--upsert": "upsert" };

/** Read `--name value` and `--name=value` forms. Unknown flags land in `rest`. */
export function parseArgs(argv = []) {
  const options = { rest: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const eq = arg.indexOf("=");
    const flag = arg.startsWith("--") && eq > 0 ? arg.slice(0, eq) : arg;
    const inline = arg.startsWith("--") && eq > 0 ? arg.slice(eq + 1) : undefined;

    if (flag in BOOLEAN_FLAGS) {
      options[BOOLEAN_FLAGS[flag]] = true;
      continue;
    }
    if (flag in PLAIN_FLAGS) {
      const value = inline ?? argv[++i];
      if (value !== undefined) options[PLAIN_FLAGS[flag]] = value;
      continue;
    }
    const slot = SLOT_FLAGS.find((entry) => entry.flag === flag);
    if (slot) {
      const value = inline ?? argv[++i];
      if (value !== undefined) {
        options.overrides ??= [];
        options.overrides.push({ slot, value });
      }
      continue;
    }
    options.rest.push(arg);
  }
  return options;
}

/** Set a nested value, creating the parent object when needed. */
function setPath(target, path, value) {
  const parent = path.length === 1 ? target : (target[path[0]] ??= {});
  parent[path[path.length - 1]] = value;
}

/** Remove a nested value without leaving an empty parent behind. */
function clearPath(target, path) {
  if (path.length === 1) {
    delete target[path[0]];
    return;
  }
  const parent = target[path[0]];
  if (!parent || typeof parent !== "object") return;
  delete parent[path[path.length - 1]];
}

/**
 * Copy a config object and apply CLI overrides on top.
 * A direct value wins over a key for the same slot, so setting one clears the other.
 */
export function mergeConfig(config = {}, overrides = [], authType) {
  const source = config && typeof config === "object" && !Array.isArray(config) ? config : {};
  const merged = structuredClone(source);
  for (const { slot, value } of overrides) {
    setPath(merged, slot.set, value);
    for (const path of slot.clear) clearPath(merged, path);
  }
  if (authType) setPath(merged, ["auth", "type"], authType);
  else if (overrides.some(({ slot }) => slot.set.join(".").startsWith("auth.token"))) {
    // A token on the command line should select bearer auth unless the caller said otherwise.
    clearPath(merged, ["auth", "type"]);
  }
  return merged;
}

/** Read and parse a JSON file, with the path kept as the user typed it. */
function readJson(path, label) {
  try {
    const text = readFileSync(resolve(path), "utf8").replace(/^\uFEFF/, "");
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`Cannot read ${label} ${path}: ${error.message}`);
  }
}

/** Write the result to stdout, or to the `--out` file. */
function emit(payload, out) {
  const json = JSON.stringify(payload, null, 2);
  if (out) {
    writeFileSync(resolve(out), `${json}\n`, "utf8");
    console.error(`Wrote ${out}`);
    return;
  }
  console.log(json);
}

/**
 * Run the CLI.
 *
 * @param {string[]} argv arguments after the script name
 * @returns {Promise<object|null>} the created post, or the dry-run plan
 */
export async function run(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const { config: configPath, file, out, dryRun, overrides = [] } = options;

  if (!file) {
    console.error(USAGE);
    process.exitCode = 1;
    return null;
  }

  if (!configPath && overrides.length === 0) {
    console.error("Pass --config site.json, or supply --base-url and credentials with flags.");
    console.error(USAGE);
    process.exitCode = 1;
    return null;
  }

  try {
    const fileConfig = configPath ? readJson(configPath, "config") : {};
    const config = mergeConfig(fileConfig, overrides, options.authType);
    const { baseUrl, authType, authHeader } = resolveWpConfig(config);

    const article = readJson(file, "article");

    if (dryRun) {
      const plan = { baseUrl, authType, post: toWpPost(article) };
      emit(plan, null);
      return plan;
    }

    if (article?.slug && !options.upsert) {
      try {
        const existing = await findPostBySlug(baseUrl, authHeader, article.slug);
        if (existing && existing.id) {
          throw new Error(
            `A post with slug "${article.slug}" already exists (id ${existing.id}). Use --upsert to update it instead of creating a duplicate.`,
          );
        }
      } catch (error) {
        if (error && /already exists/.test(error.message)) throw error;
        // ignore lookup errors; publishing proceeds
      }
    }

    const result = options.upsert
      ? await upsertArticle(baseUrl, authHeader, article)
      : await publishArticle(baseUrl, authHeader, article);
    emit(result, out);
    return result;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
    return null;
  }
}

if (isEntryPoint(import.meta.url)) {
  await run();
}

export default run;
