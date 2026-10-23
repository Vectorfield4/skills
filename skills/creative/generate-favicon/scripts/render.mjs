#!/usr/bin/env node
// Favicon: plan the render, then apply it.
//
// Run from the project root. Without --apply nothing is written and no credits
// are spent, so the agent can show the prompt and the key state first.

import { join, resolve } from "node:path";

import { isEntryPoint, parseFlags } from "#lib/cli.mjs";
import { faviconPrompt } from "#lib/image-prompts.mjs";
import { projectRoot, readJsonIfExists } from "#lib/project.mjs";
import { renderAndSave } from "#lib/render-image.mjs";
import { apiKey } from "#lib/runware.mjs";

const USAGE = `Usage:
  node <skill>/scripts/render.mjs [--name <site>] [--topic <topic>] [--plan] [--json]
  node <skill>/scripts/render.mjs [--name <site>] [--topic <topic>] --apply [--json]

Flags: --bg #1f1f1f, --fg #ffffff, --out public/favicon.png, --model runware:5@1,
       --size 512, --steps 25, --cfg 4, --seed <n>, --prompt <text>, --negative <text>,
       --root <dir>`;

const FLAGS = {
  name: "string",
  topic: "string",
  bg: "string",
  fg: "string",
  out: "string",
  model: "string",
  size: "number",
  steps: "number",
  cfg: "number",
  seed: "number",
  prompt: "string",
  negative: "string",
  root: "string",
  plan: "boolean",
  apply: "boolean",
  json: "boolean",
};

function buildRequest(flags) {
  const root = flags.root ? resolve(flags.root) : projectRoot();
  const manifest = readJsonIfExists(join(root, "package.json"), {});
  const name = flags.name ?? manifest.name ?? "site";
  const fallback = faviconPrompt({
    name,
    topic: flags.topic ?? "",
    bg: flags.bg ?? "#1f1f1f",
    fg: flags.fg ?? "#ffffff",
  });
  const size = flags.size ?? 512;

  return {
    root,
    name,
    request: {
      prompt: flags.prompt ?? fallback.prompt,
      negativePrompt: flags.negative ?? fallback.negativePrompt,
      model: flags.model ?? "runware:5@1",
      width: size,
      height: size,
      steps: flags.steps ?? 25,
      cfgScale: flags.cfg ?? 4,
      seed: flags.seed,
      out: flags.out ?? "public/favicon.png",
    },
  };
}

async function main(argv) {
  let flags;
  try {
    flags = parseFlags(argv, FLAGS);
  } catch (error) {
    console.error(`${error.message}\n\n${USAGE}`);
    process.exitCode = 1;
    return;
  }

  const { root, name, request } = buildRequest(flags);
  const hasKey = Boolean(apiKey());

  if (!flags.apply) {
    const plan = { ok: true, plan: true, hasKey, root, name, ...request };
    if (flags.json) console.log(JSON.stringify(plan, null, 2));
    else {
      console.log(`favicon for ${name} -> ${request.out}`);
      console.log(`  model ${request.model}, ${request.width}x${request.height}, steps ${request.steps}`);
      console.log(`  prompt: ${request.prompt}`);
      console.log(`  negative: ${request.negativePrompt}`);
      console.log(
        hasKey
          ? "(plan only, nothing written; rerun with --apply)"
          : "(plan only; RUNWARE_API_KEY is not set, --apply would fail)",
      );
    }
    return;
  }

  if (!hasKey) {
    console.error("favicon: RUNWARE_API_KEY is not set");
    process.exitCode = 1;
    return;
  }

  try {
    const result = await renderAndSave({ ...request, root });
    if (flags.json) console.log(JSON.stringify(result, null, 2));
    else console.log(`saved ${result.file} (${result.width}x${result.height}, ${result.bytes} bytes)`);
  } catch (error) {
    console.error(`favicon: ${error.message}`);
    process.exitCode = 1;
  }
}

if (isEntryPoint(import.meta.url)) {
  await main(process.argv.slice(2));
}
