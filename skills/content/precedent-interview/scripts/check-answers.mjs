// Domain gate for a filled precedent questionnaire. The generic YAML reader
// checks types and required fields; this script checks the things a type cannot
// express: how many metrics, whether a claimed number has proof, whether the
// page would be a brochure, whether forbidden marketing words slipped in.
//
//   node check-answers.mjs --answers data/content/precedent-questionnaire.yaml
//
// Exit codes: 0 gate passed, 1 blocking findings, 2 broken input.

import { readFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";

import { isEntryPoint, parseFlags, wantsHelp } from "#lib/cli.mjs";
import { readYaml } from "#lib/yaml/utilities/read-yaml.mjs";

const USAGE = `check-answers — run the precedent publication gate on a filled questionnaire

  node check-answers.mjs --answers <yaml> [flags]

Flags
  --answers <path>   Filled questionnaire YAML. Required.
  --type <path>      Contract. Default "content/precedent-questionnaire".
  --project <path>   Cross-check slugs against a project (audiences, services).
  --strict           Fail on warnings too.
  --pretty           Indented JSON output.

Exit codes: 0 passed, 1 blocking findings, 2 broken input.
`;

const FLAG_SPEC = {
  answers: "string",
  type: "string",
  project: "string",
  strict: "boolean",
  pretty: "boolean",
};

const FORBIDDEN_WORDS = [
  "гарантируем",
  "гарантия",
  "лучший",
  "номер один",
  "первый в",
  "безупречн",
  "революцион",
  "вырастет на",
  "до 99%",
  "мы сделали",
];

function daysBetween(from, to) {
  if (!from || !to) return null;
  const a = Date.parse(from);
  const b = Date.parse(to);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86400000);
}

function collectStrings(value, out = []) {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) value.forEach((item) => collectStrings(item, out));
  else if (value && typeof value === "object") {
    for (const key of Object.keys(value)) collectStrings(value[key], out);
  }
  return out;
}

function readProjectValues(projectPath) {
  const result = { audiences: [], services: [] };
  if (!projectPath) return result;
  try {
    const source = readFileSync(path.join(projectPath, "src/shared/i18n/ru/audiences.ts"), "utf8");
    result.audiences = [...source.matchAll(/^\s*(\w+)\s*:/gm)].map((m) => m[1]);
  } catch {}
  try {
    const dir = path.join(projectPath, "src/entities/service/model/fixtures");
    for (const file of readdirSync(dir)) {
      if (!file.endsWith(".ts")) continue;
      const source = readFileSync(path.join(dir, file), "utf8");
      const match = source.match(/slug:\s*"([^"]+)"/);
      if (match) result.services.push(match[1]);
    }
  } catch {}
  return result;
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

  if (!flags.answers) {
    process.stderr.write(`--answers is required\n\n${USAGE}`);
    return 2;
  }

  let loaded;
  try {
    loaded = readYaml({ file: flags.answers, type: flags.type ?? "content/precedent-questionnaire", strict: true });
  } catch (error) {
    process.stderr.write(`error: ${error?.stack ?? error}\n`);
    return 2;
  }

  const value = loaded.value;
  const validation = loaded.validation;
  const blocking = [];
  const warnings = [];

  const push = (list, message) => list.push(message);

  if (!validation.ok) {
    for (const error of validation.errors) push(blocking, `${error.path}: ${error.message}`);
  }
  for (const warning of validation.warnings) push(warnings, `${warning.path}: ${warning.message}`);

  if (validation.completeness.ratio < 0.8) {
    push(blocking, `completeness ${Math.round(validation.completeness.ratio * 100)}% is below 80%`);
  }

  const results = value?.results ?? {};
  const primary = Array.isArray(results.primary) ? results.primary : [];
  if (primary.length === 0) push(blocking, "results.primary must contain at least one metric");
  if (primary.length > 3) push(blocking, `results.primary has ${primary.length} metrics; a case card holds exactly 3`);
  if (primary.length !== 3) push(warnings, `results.primary has ${primary.length} metrics; 3 is the expected count for a case card`);

  primary.forEach((metric, index) => {
    const prefix = `results.primary[${index}]`;
    if (!metric?.name) push(blocking, `${prefix}.name is empty`);
    if (metric?.baseline === null || metric?.baseline === undefined) push(blocking, `${prefix}.baseline is missing`);
    if (metric?.after === null || metric?.after === undefined) push(blocking, `${prefix}.after is missing`);
    if (!metric?.method) push(blocking, `${prefix}.method is missing`);
    if (!metric?.window?.from) push(blocking, `${prefix}.window.from is missing`);
    if (metric?.source === "estimate") push(blocking, `${prefix}.source is "estimate"; a precedent needs a real source`);
    if (metric?.confidence === "claimed") push(blocking, `${prefix}.confidence is "claimed"; a precedent needs "measured"`);
    if (metric?.confidence === "estimated") push(warnings, `${prefix}.confidence is "estimated", not "measured"`);
    const span = daysBetween(metric?.window?.from, metric?.window?.to);
    if (span !== null && span < 28) push(warnings, `${prefix}.window is shorter than 4 weeks (${span} days)`);
  });

  const problem = value?.problem ?? {};
  if (!Array.isArray(problem.costOfStatusQuo) || problem.costOfStatusQuo.length === 0) {
    push(blocking, "problem.costOfStatusQuo must contain at least one line");
  }
  if (!problem.beforeProcess) push(blocking, "problem.beforeProcess is empty");
  if (!problem.trigger) push(blocking, "problem.trigger is empty");

  const solution = value?.solution ?? {};
  if (!Array.isArray(solution.scope) || solution.scope.length === 0) push(blocking, "solution.scope is empty");
  if (!Array.isArray(solution.outOfScope) || solution.outOfScope.length === 0) push(blocking, "solution.outOfScope is empty; a page with no stated limits is a brochure");
  if (!Array.isArray(solution.services) || solution.services.length === 0) push(blocking, "solution.services is empty");

  const resultsBlock = value?.results ?? {};
  if (!Array.isArray(resultsBlock.whatDidNotWork) || resultsBlock.whatDidNotWork.length === 0) {
    push(blocking, "results.whatDidNotWork must contain at least one honest limit");
  }
  if (!Array.isArray(resultsBlock.qualitative) || resultsBlock.qualitative.length === 0) {
    push(warnings, "results.qualitative is empty; add at least one observable change without a number");
  }

  const client = value?.client ?? {};
  if (client.disclosure === "name" && !client.name) push(blocking, "client.disclosure is \"name\" but client.name is empty");
  if (client.disclosure !== "name" && client.name) push(blocking, "client.name is filled but disclosure is not \"name\"");
  if (!client.audienceKey) push(blocking, "client.audienceKey is empty");
  if (!client.industry) push(blocking, "client.industry is empty");

  const publication = value?.publication ?? {};
  if (publication.allowed === false && Array.isArray(publication.channels) && publication.channels.length > 0) {
    push(blocking, "publication.allowed is false but channels are listed");
  }
  if (publication.allowed === true && (!Array.isArray(publication.channels) || publication.channels.length === 0)) {
    push(blocking, "publication.allowed is true but no channels are listed");
  }
  if (publication.quote && publication.quote.approved && (!publication.quote.text || !publication.quote.authorRole)) {
    push(blocking, "publication.quote is approved but text or authorRole is missing");
  }
  if (!Array.isArray(publication.relatedServices) || publication.relatedServices.length === 0) {
    push(blocking, "publication.relatedServices is empty");
  }

  const evidence = value?.evidence ?? {};
  if (!Array.isArray(evidence.artifacts) || evidence.artifacts.length === 0) {
    push(blocking, "evidence.artifacts is empty; a precedent needs proof");
  }
  if (Array.isArray(evidence.artifacts)) {
    evidence.artifacts.forEach((artifact, index) => {
      if (artifact?.pii && (!Array.isArray(evidence.anonymization) || evidence.anonymization.length === 0)) {
        push(blocking, `evidence.artifacts[${index}] has pii: true but anonymization is empty`);
      }
    });
  }
  if (!Array.isArray(evidence.whoCanConfirm) || evidence.whoCanConfirm.length === 0) {
    push(warnings, "evidence.whoCanConfirm is empty");
  }

  const commercial = value?.commercial ?? {};
  if (!Array.isArray(commercial.clientOwns) || commercial.clientOwns.length === 0) {
    push(blocking, "commercial.clientOwns is empty");
  }

  const timeline = value?.timeline ?? {};
  if (!timeline.kickoff) push(blocking, "timeline.kickoff is empty");

  const text = collectStrings(value).join(" \n ");
  for (const word of FORBIDDEN_WORDS) {
    if (text.toLowerCase().includes(word.toLowerCase())) {
      push(warnings, `forbidden marketing word "${word}" found in the text`);
    }
  }

  if (flags.project) {
    const project = readProjectValues(flags.project);
    if (client.audienceKey && project.audiences.length && !project.audiences.includes(client.audienceKey.replace(/^audiences\./, ""))) {
      // audienceKey is stored as "audiences.builders"; check the key part
      const key = client.audienceKey.replace(/^audiences\./, "");
      if (!project.audiences.includes(key)) push(warnings, `client.audienceKey "${client.audienceKey}" is not declared in the project`);
    }
    if (Array.isArray(publication.relatedServices)) {
      for (const slug of publication.relatedServices) {
        if (project.services.length && !project.services.includes(slug)) {
          push(warnings, `publication.relatedServices contains "${slug}", which is not a service in the project`);
        }
      }
    }
  }

  const gate = {
    ok: blocking.length === 0 && (flags.strict ? warnings.length === 0 : true),
    blocking,
    warnings,
    completeness: validation.completeness,
    primaryCount: primary.length,
  };

  process.stdout.write(JSON.stringify(gate, null, flags.pretty ? 2 : undefined));
  process.stdout.write("\n");
  return gate.ok ? 0 : 1;
}

if (isEntryPoint(import.meta.url)) {
  main().then(
    (code) => process.exit(code),
    (error) => {
      process.stderr.write(`error: ${error?.stack ?? error}\n`);
      process.exit(2);
    },
  );
}
