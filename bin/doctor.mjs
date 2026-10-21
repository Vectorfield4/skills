/**
 * Doctor: verify the global skill mounts and flag project-local leftovers.
 *
 * Usage:
 *   npm run doctor                  check the mounts only
 *   npm run doctor -- <project>     also check that project for a local .opencode
 */
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG_DIR = process.env.OPENCODE_CONFIG_DIR ?? join(homedir(), ".config", "opencode");

/** Skills the setup is incomplete without. */
const KNOWN_SKILLS = [
  "content/write-article",
  "content/write-service",
  "content/write-solution",
  "creative/generate-image-cover",
  "devops/release",
  "devops/rollup",
  "quality/code-quality",
];

const failures = [];

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

function checkProject(project) {
  for (const name of ["skills", "agent"]) {
    const local = join(project, ".opencode", name);
    check(!existsSync(local), `${project}: no local .opencode/${name}`);
  }
  const tracked = trackedOpencode(project);
  check(tracked.length === 0, `${project}: no tracked .opencode files`);
  if (tracked.length > 0) console.log(`     ${tracked.length} tracked entries, remove them from the repo`);
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
if (project) checkProject(project);

console.log(failures.length === 0 ? "doctor: ok" : `doctor: ${failures.length} problem(s)`);
process.exit(failures.length === 0 ? 0 : 1);
