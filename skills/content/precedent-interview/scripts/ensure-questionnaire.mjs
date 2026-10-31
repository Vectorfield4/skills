// Ensures a filled precedent questionnaire exists before a case page or a
// solution precedent is written. If the file is missing, empty or still in
// draft state, the template is generated and the run stops with exit code 1 so
// the caller fills it instead of writing a page from nothing.
//
//   node ensure-questionnaire.mjs --slug cv-acceptance-control
//
// Exit codes: 0 filled questionnaire ready, 1 template generated (fill it),
// 2 error.

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { isEntryPoint, parseFlags, wantsHelp } from "#lib/cli.mjs";
import { parseYaml } from "#lib/yaml/parse.mjs";
import { resolveTypeFile } from "#lib/yaml/utilities/read-yaml.mjs";

import { fileURLToPath } from "node:url";
// ...
const GENERATOR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "scripts", "questionnaire.mjs");

const USAGE = `ensure-questionnaire — make sure a filled precedent questionnaire exists

  node ensure-questionnaire.mjs --slug <slug> [flags]

Flags
  --slug <slug>     Page slug, kebab-case. Required.
  --type <path>     Contract. Default "content/precedent-questionnaire".
  --domain <name>   Domain folder under data/. Default: first segment of --type.
  --out <path>      Questionnaire file. Default "data/<domain>/precedent-questionnaire.yaml".
  --project <path>  Read allowed values from a project when generating.
  --force           Regenerate the template even when a filled file exists.

Exit codes: 0 ready, 1 template generated (fill it), 2 error.
`;

const FLAG_SPEC = {
  slug: "string",
  type: "string",
  domain: "string",
  out: "string",
  project: "string",
  force: "boolean",
};

function isFilled(file) {
  if (!existsSync(file)) return false;
  let parsed;
  try {
    parsed = parseYaml(readFileSync(file, "utf8"));
  } catch {
    return false;
  }
  if (!parsed || typeof parsed !== "object") return false;
  if (parsed.status !== "filled" && parsed.status !== "reviewed") return false;
  return true;
}

async function main() {
  const argv = process.argv.slice(2);
  if (wantsHelp(argv)) {
    process.stdout.write(`${USAGE}\n`);
    return 0;
  }

  let flags;
  try {
    flags = parseFlags(argv, FLAG_SPEC);
  } catch (error) {
    process.stderr.write(`${error.message}\n\n${USAGE}`);
    return 2;
  }

  if (!flags.slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(flags.slug)) {
    process.stderr.write(`--slug is required and must be kebab-case\n\n${USAGE}`);
    return 2;
  }

  const typeSpec = flags.type ?? "content/precedent-questionnaire";
  const domain = flags.domain ?? typeSpec.split(/[\\/]/)[0];
  const outPath = flags.out ?? path.join(process.cwd(), "data", domain, "precedent-questionnaire.yaml");

  if (!flags.force && isFilled(outPath)) {
    process.stdout.write(JSON.stringify({ ready: true, file: outPath, status: parseYaml(readFileSync(outPath, "utf8")).status }, null, 2));
    process.stdout.write("\n");
    return 0;
  }

  // Generate the template by delegating to the generator.
  const { spawnSync } = await import("node:child_process");
  const args = [GENERATOR, `--slug=${flags.slug}`, `--out=${outPath}`, `--type=${typeSpec}`];
  if (flags.project) args.push(`--project=${flags.project}`);
  if (!isFilled(outPath)) args.push("--force");
  const result = spawnSync(process.execPath, args, { stdio: "inherit" });
  if (result.status !== 0 && result.status !== 1) {
    process.stderr.write(`generator failed with exit code ${result.status}\n`);
    return 2;
  }

  process.stderr.write(
    `\nTemplate written to ${outPath}.\nFill it in, set status to "filled", then run check-answers.mjs.\n`,
  );
  process.stdout.write(JSON.stringify({ ready: false, file: outPath, generated: true }, null, 2));
  process.stdout.write("\n");
  return 1;
}

if (isEntryPoint(import.meta.url)) {
  main().then(
    (code) => process.exit(code ?? 0),
    (error) => {
      process.stderr.write(`error: ${error?.stack ?? error}\n`);
      process.exit(2);
    },
  );
}
