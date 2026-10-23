/**
 * Doctor: verify the global skill mounts and the project copies they own.
 *
 * Usage:
 *   node skills/devops/doctor/scripts/doctor.mjs            check the mounts only
 *   node skills/devops/doctor/scripts/doctor.mjs <project>   also check the project
 */
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Repo root: this script sits in skills/devops/doctor/scripts/. */
const ROOT = resolve(dirname(realpathSync(fileURLToPath(import.meta.url))), "..", "..", "..", "..");
const CONFIG_DIR = process.env.OPENCODE_CONFIG_DIR ?? join(homedir(), ".config", "opencode");

/** Skills the setup is incomplete without. */
const KNOWN_SKILLS = [
  "content/write-article",
  "content/write-service",
  "content/write-solution",
  "creative/generate-image-cover",
  "devops/doctor",
  "devops/release",
  "devops/rollup",
  "quality/code-quality",
];

const failures = [];

/**
 * Files that a project installs verbatim from this repo. A project copy must stay
 * byte-identical apart from line endings, because a husky hook cannot import
 * `#lib/*` and must carry its own copy of the code. An optional entry is checked
 * when present and ignored when the project never installed it.
 */
const TEMPLATED = [
  { installed: "scripts/version.mjs", template: "lib/templates/version.mjs", required: true },
  { installed: "scripts/commit-msg.mjs", template: "lib/templates/commit-msg.mjs", required: false },
];

/**
 * Engine files that used to be copied into every project and now live in a skill
 * or in `lib/`. A project copy drifts, so any copy fails the check.
 */
const MOVED_INTO_SKILLS = [
  "scripts/release.mjs",
  "scripts/changelog.mjs",
  "scripts/commit-convention.mjs",
];

/** Text with line endings normalized, so a CRLF checkout compares equal to the template. */
function normalized(text) {
  return text.replace(/\r\n/g, "\n");
}

function check(ok, message) {
  console.log(`${ok ? "ok  " : "fail"} ${message}`);
  if (!ok) failures.push(message);
}

/** Compare the mount target with the expected directory in this repo. */
function mountStatus(name) {
  const link = join(CONFIG_DIR, name);
  if (!existsSync(link)) return { ok: false, reason: "missing" };
  if (!lstatSync(link).isSymbolicLink()) return { ok: false, reason: "not a symlink" };
  const target = realpathSync(link);
  const expected = realpathSync(join(ROOT, name));
  return { ok: target === expected, reason: target === expected ? "resolves" : `points to ${target}` };
}

/** Git-tracked `.opencode` entries in a project, empty when the project is not a repo. */
function trackedOpencode(project) {
  if (!existsSync(join(project, ".git"))) return [];
  try {
    const out = execFileSync("git", ["ls-files", ".opencode"], {
      cwd: project,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return out.trim() ? out.trim().split("\n") : [];
  } catch {
    return [];
  }
}

/** A project may not keep any `.opencode`, tracked or ignored. False stops the remaining project checks. */
function checkProject(project) {
  if (!existsSync(project) || !statSync(project).isDirectory()) {
    check(false, `${project}: not a directory`);
    return false;
  }

  const local = join(project, ".opencode");
  const present = existsSync(local);
  check(!present, `${project}: no .opencode directory`);
  if (!present) return true;

  if (!statSync(local).isDirectory()) {
    console.log("     it is a file, not a directory");
    return true;
  }

  const entries = readdirSync(local);
  const tracked = trackedOpencode(project);
  console.log(`     ${basename(local)}: ${entries.length === 0 ? "empty" : `${entries.length} entries`}`);
  console.log(
    tracked.length === 0
      ? "     untracked or gitignored, delete it anyway"
      : `     ${tracked.length} tracked by git, delete it and commit the removal`,
  );
  console.log("     skills and agents load from the global mount only");
  return true;
}

/** Compare an installed copy with the template it was generated from. */
function checkTemplates(project) {
  for (const { installed, template, required } of TEMPLATED) {
    const projectFile = join(project, installed);
    const templateFile = join(ROOT, template);
    if (!existsSync(templateFile)) {
      check(false, `${template}: template is missing`);
      continue;
    }
    if (!existsSync(projectFile)) {
      if (required) check(false, `${project}: ${installed} missing, install it from ${template}`);
      continue;
    }
    const same =
      normalized(readFileSync(projectFile, "utf8")) ===
      normalized(readFileSync(templateFile, "utf8"));
    check(same, `${project}: ${installed} ${same ? "matches" : "drifted from"} ${template}`);
  }
}

/** Engine copies that belong to a skill now, not to the project. */
function checkLeftovers(project) {
  for (const file of MOVED_INTO_SKILLS) {
    const present = existsSync(join(project, file));
    check(!present, `${project}: no leftover ${file} (engine code lives in lib/)`);
  }
}

check(existsSync(join(ROOT, "skills")), `${ROOT}: skills directory exists`);
check(existsSync(join(ROOT, "agent")), `${ROOT}: agent directory exists`);

for (const name of ["skills", "agent"]) {
  const status = mountStatus(name);
  check(status.ok, `${CONFIG_DIR}\\${name} ${status.reason}`);
}

for (const skill of KNOWN_SKILLS) {
  check(existsSync(join(CONFIG_DIR, "skills", skill, "SKILL.md")), `skill ${skill} resolves through the mount`);
}

const project = process.argv[2] ? resolve(process.argv[2]) : undefined;
if (project && checkProject(project)) {
  checkTemplates(project);
  checkLeftovers(project);
}

console.log(failures.length === 0 ? "doctor: ok" : `doctor: ${failures.length} problem(s)`);
process.exit(failures.length === 0 ? 0 : 1);
